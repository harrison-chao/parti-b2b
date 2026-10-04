import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { isNextWorkOrderStatus, nextWorkOrderStatus, salesOrderStatusFor } from "@/lib/workorder";
import { consumeWorkOrderMaterials, getMaterialShortages, formatShortages } from "@/lib/stock-consume";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  toStatus: z.enum(["PENDING_START", "PROCESSING", "OUTSOURCING", "QC", "PACKING", "READY_TO_SHIP", "SHIPPED"]).optional(),
  advance: z.boolean().optional(),
  note: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  trackingNo: z.string().optional().nullable(),
  delayReason: z.string().optional().nullable(),
  force: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { workOrderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "WORKSHOP") return fail("无权操作", 403, 403);

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { advance, toStatus, note, carrier, trackingNo, delayReason, force } = parsed.data;

  const wo = await prisma.workOrder.findUnique({ where: { workOrderNo: params.workOrderNo } });
  if (!wo) return fail("加工单不存在", 404, 404);
  if (role === "WORKSHOP" && wo.workshopId !== session.user.workshopId) return fail("非本车间订单", 403, 403);

  let target: "PENDING_START" | "PROCESSING" | "OUTSOURCING" | "QC" | "PACKING" | "READY_TO_SHIP" | "SHIPPED" | "CANCELLED" | null = toStatus ?? null;
  if (!target && advance) {
    target = nextWorkOrderStatus(wo.status, wo.qcRequired);
    if (!target) return fail("已到最后状态，无法继续推进");
  }
  if (!target) return fail("缺少 toStatus 或 advance");
  if (target === wo.status) return fail("目标状态与当前相同");
  if (!isNextWorkOrderStatus(wo.status, target, wo.qcRequired)) {
    return fail(`加工单状态只能按流程逐步推进：当前 ${wo.status}，目标 ${target}`);
  }

  if (target === "SHIPPED" && (!carrier || !trackingNo)) {
    return fail("出运需填写物流公司和运单号");
  }

  if (target === "PACKING") {
    const existingConsume = await prisma.stockMovement.count({
      where: { refType: "WO", refNo: wo.workOrderNo, type: "WORK_ORDER_CONSUME" },
    });
    if (existingConsume === 0) {
      const shortages = await getMaterialShortages(prisma, wo.orderNo, wo.workshopId);
      if (shortages.length > 0) {
        return fail(`库存不足，无法进入打包：${formatShortages(shortages)}`);
      }
    }
  }

  // B1 缺料前移：开工即检查（而非等到打包才发现），默认拒绝、force 放行并留痕
  if (target === "PROCESSING") {
    const shortages = await getMaterialShortages(prisma, wo.orderNo, wo.workshopId);
    if (shortages.length > 0 && !force) {
      return fail(`库存不足，无法开工：${formatShortages(shortages)}。确认已备料/外协自理可强制开工（将记录缺料放行）`);
    }
  }
  const shortageNote = target === "PROCESSING" && force
    ? await getMaterialShortages(prisma, wo.orderNo, wo.workshopId).then((s) =>
        s.length ? `【缺料放行】${formatShortages(s)}${note ? "；" + note : ""}` : note,
      )
    : note;

  const updateData: any = {
    status: target,
    currentNote: shortageNote ?? wo.currentNote,
  };
  if (carrier !== undefined) updateData.carrier = carrier;
  if (trackingNo !== undefined) updateData.trackingNo = trackingNo;
  if (delayReason !== undefined) updateData.delayReason = delayReason;
  if (target === "SHIPPED") updateData.actualShippedAt = new Date();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // 乐观锁：仅当状态仍是读取时的状态才更新，防止并发双击产生重复事件/重复扣减
      const res = await tx.workOrder.updateMany({
        where: { id: wo.id, status: wo.status },
        data: updateData,
      });
      if (res.count === 0) throw new Error("加工单状态已被他人变更，请刷新后重试");
      const u = await tx.workOrder.findUniqueOrThrow({ where: { id: wo.id } });
    await tx.workOrderEvent.create({
      data: {
        workOrderId: wo.id,
        fromStatus: wo.status,
        toStatus: target!,
        note: shortageNote ?? null,
        operatorUserId: session.user.id,
        operatorName: session.user.name,
      },
    });

    const soStatus = salesOrderStatusFor(target!);
    const soData: any = { orderStatus: soStatus };
    if (target === "SHIPPED") soData.actualDeliveryDate = new Date();
    if (target === "SHIPPED" && trackingNo) soData.logisticsNo = trackingNo;
    await tx.salesOrder.update({ where: { orderNo: wo.orderNo }, data: soData });

    // Auto-decrement inventory on first transition INTO PACKING. Idempotent via existing movement check.
    if (target === "PACKING") {
      await consumeWorkOrderMaterials(tx, {
        workOrderNo: wo.workOrderNo,
        orderNo: wo.orderNo,
        workshopId: wo.workshopId,
        note: "进入 PACKING 自动扣减",
        operatorName: session.user.name,
      });
    }

    await logAudit({
      action: "WORK_ORDER_STATUS_ADVANCE",
      entityType: "WorkOrder",
      entityId: wo.id,
      targetWorkshopId: wo.workshopId,
      summary: `推进加工单状态：${wo.workOrderNo} ${wo.status} → ${target}`,
      detail: {
        workOrderNo: wo.workOrderNo,
        orderNo: wo.orderNo,
        fromStatus: wo.status,
        toStatus: target,
        note,
        carrier,
        trackingNo,
      },
      actor: session.user,
    }, tx);

      return u;
    }, { timeout: 120_000, maxWait: 120_000 });

    return ok(updated);
  } catch (error: any) {
    return fail(error?.message ?? "加工单状态更新失败");
  }
}

