import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireRole } from "@/lib/api";
import { genWorkOrderNo } from "@/lib/utils";
import { getMaterialShortages, formatShortages } from "@/lib/stock-consume";
import { prepayViolation } from "@/lib/payment-guard";
import { queueLoad, skuCycleStats, globalCycleStats, suggestDeliveryDays } from "@/lib/delivery-insight";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

export async function GET() {
  const guard = await requireRole("ADMIN");
  if (guard.response) return guard.response;
  const session = guard.session;
  const workOrders = await prisma.workOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: { workshop: true, order: { include: { dealer: true } } },
  });
  return ok({ workOrders });
}

const schema = z.object({
  orderNo: z.string().min(1),
  workshopId: z.string().min(1),
  committedDeliveryDate: z.string().optional().nullable(),
  qcRequired: z.boolean().optional(),
  note: z.string().optional().nullable(),
  // P1-B1: 缺料强制放行（记录缺料明细）
  force: z.boolean().optional(),
  // P1-A: 承诺交期早于建议值时的提前原因（必填校验在服务端）
  overrideReason: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const guard = await requireRole("ADMIN");
  if (guard.response) return guard.response;
  const session = guard.session;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { orderNo, workshopId, committedDeliveryDate, qcRequired, note, force, overrideReason } = parsed.data;

  const order = await prisma.salesOrder.findUnique({
    where: { orderNo },
    include: { lines: true, dealer: true },
  });
  if (!order) return fail("订单不存在", 404, 404);
  if (!["CONFIRMED", "PARTIALLY_PAID"].includes(order.orderStatus)) {
    return fail(`订单状态 ${order.orderStatus} 不可派单（需已确认或部分付款）`);
  }
  const producibleLines = order.lines.filter((l) => l.lineType !== "OUTSOURCED");
  if (producibleLines.length === 0) {
    return fail("此订单全部为外购行，无需派至车间。请直接走发货流程。");
  }
  const exists = await prisma.workOrder.findUnique({ where: { orderNo } });
  if (exists) return fail("该订单已派单");

  const workshop = await prisma.workshop.findUnique({ where: { id: workshopId } });
  if (!workshop || !workshop.isActive) return fail("车间不存在或已停用");

  // P1-D: 先款后产（客户开关 + 内部单豁免）
  const prepayErr = prepayViolation(order, order.dealer, "DISPATCH");
  if (prepayErr) return fail(prepayErr);

  // P1-B1: 缺料前移到派单（默认拒绝，force 放行并留痕）
  const shortages = await getMaterialShortages(prisma, orderNo, workshopId);
  if (shortages.length > 0 && !force) {
    return fail(`库存不足，不建议派单：${formatShortages(shortages)}。已确认备料/外协自理可勾选「缺料放行」继续（将记录缺料明细）`);
  }
  const finalNote = shortages.length > 0 && force
    ? `【缺料放行】${formatShortages(shortages)}${note ? "；" + note : ""}`
    : note;

  // P1-A: 承诺交期建议值校验（早于建议需 overrideReason）
  const rawProductIds = [...new Set(order.lines.filter((l) => l.rawProductId).map((l) => l.rawProductId!))];
  const [load, skuStats, globalStats] = await Promise.all([
    queueLoad(),
    rawProductIds.length ? skuCycleStats(rawProductIds) : Promise.resolve(new Map()),
    globalCycleStats(),
  ]);
  const skuStat = rawProductIds.length === 1 ? (skuStats.get(rawProductIds[0]) ?? null) : (skuStats.size ? [...skuStats.values()][0] : null);
  const cycle = skuStat ?? globalStats;
  const suggestion = suggestDeliveryDays(cycle, load, order.targetDeliveryDate);
  const suggestedDate = new Date(Date.now() + suggestion.days * 24 * 60 * 60 * 1000);
  const committed = committedDeliveryDate ? new Date(committedDeliveryDate) : order.targetDeliveryDate;
  if (committed < suggestedDate && !(overrideReason ?? "").trim()) {
    return fail(`承诺交期早于系统建议（建议 ${suggestedDate.toLocaleDateString("zh-CN")}，依据：${suggestion.basis}）。确要提前请在「提前原因」填写说明后重试`);
  }

  const workOrderNo = genWorkOrderNo();

  const wo = await prisma.$transaction(async (tx) => {
    const created = await tx.workOrder.create({
      data: {
        workOrderNo,
        orderNo,
        workshopId,
        status: "PENDING_START",
        committedDeliveryDate: committed,
        qcRequired: qcRequired ?? true,
        currentNote: finalNote ?? null,
        committedOverrideReason: committed < suggestedDate ? ((overrideReason ?? "").trim() || null) : null,
        assignedBy: session.user.name,
      },
    });
    await tx.workOrderEvent.create({
      data: {
        workOrderId: created.id,
        fromStatus: null,
        toStatus: "PENDING_START",
        note: finalNote ?? `派发至 ${workshop.name}`,
        operatorUserId: session.user.id,
        operatorName: session.user.name,
      },
    });
    await tx.salesOrder.update({
      where: { orderNo },
      data: { orderStatus: "PRODUCING" },
    });
    return created;
  });

  await logAudit({
    action: "WORK_ORDER_DISPATCH",
    entityType: "WorkOrder",
    entityId: wo.id,
    targetWorkshopId: workshopId,
    summary: `派单 ${workOrderNo} → ${workshop.name}（承诺 ${committed.toLocaleDateString("zh-CN")}）`,
    detail: {
      orderNo, workshopId, committedDeliveryDate: committed.toISOString(),
      suggestedDays: suggestion.days, suggestionBasis: suggestion.basis,
      overrideReason: committed < suggestedDate ? overrideReason : null,
      shortageForced: shortages.length > 0 && force,
      shortages: shortages.map((s) => ({ sku: s.sku, required: s.required, available: s.available })),
    },
    actor: session.user,
  });

  return ok(wo);
}
