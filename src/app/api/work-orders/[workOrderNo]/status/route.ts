import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { isNextWorkOrderStatus, nextWorkOrderStatus, salesOrderStatusFor } from "@/lib/workorder";
import { applyStockMovement } from "@/lib/inventory";
import { z } from "zod";

const schema = z.object({
  toStatus: z.enum(["SCHEDULED", "PREPARING", "PROCESSING", "QC", "PACKING", "READY_TO_SHIP", "SHIPPED"]).optional(),
  advance: z.boolean().optional(),
  note: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  trackingNo: z.string().optional().nullable(),
  delayReason: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { workOrderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "WORKSHOP") return fail("无权操作", 403, 403);

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { advance, toStatus, note, carrier, trackingNo, delayReason } = parsed.data;

  const wo = await prisma.workOrder.findUnique({ where: { workOrderNo: params.workOrderNo } });
  if (!wo) return fail("加工单不存在", 404, 404);
  if (role === "WORKSHOP" && wo.workshopId !== session.user.workshopId) return fail("非本车间订单", 403, 403);

  let target = toStatus ?? null;
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
      const shortages = await getPackingShortages(wo.orderNo, wo.workshopId);
      if (shortages.length > 0) {
        return fail(`库存不足，无法进入打包：${shortages.map((item) => `${item.sku} 需 ${item.required}，现有 ${item.available}`).join("；")}`);
      }
    }
  }

  const updateData: any = {
    status: target,
    currentNote: note ?? wo.currentNote,
  };
  if (carrier !== undefined) updateData.carrier = carrier;
  if (trackingNo !== undefined) updateData.trackingNo = trackingNo;
  if (delayReason !== undefined) updateData.delayReason = delayReason;
  if (target === "SHIPPED") updateData.actualShippedAt = new Date();

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.workOrder.update({
        where: { id: wo.id },
        data: updateData,
      });
    await tx.workOrderEvent.create({
      data: {
        workOrderId: wo.id,
        fromStatus: wo.status,
        toStatus: target!,
        note: note ?? null,
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
      const alreadyConsumed = await tx.stockMovement.count({
        where: { refType: "WO", refNo: wo.workOrderNo, type: "WORK_ORDER_CONSUME" },
      });
      if (alreadyConsumed === 0) {
        const lines = await tx.salesOrderLine.findMany({
          where: { orderNo: wo.orderNo, lineType: { not: "OUTSOURCED" } },
        });
        // HARDWARE: consume by sku 1:1 with quantity. PROFILE with rawProductId: compute bars.
        const hwAgg = new Map<string, { sku: string; productName: string; qty: number }>();
        const rawAgg = new Map<string, { productId: string; totalMm: number }>();
        for (const l of lines) {
          if (l.lineType === "HARDWARE") {
            const existing = hwAgg.get(l.sku) ?? { sku: l.sku, productName: l.productName, qty: 0 };
            existing.qty += l.quantity;
            hwAgg.set(l.sku, existing);
          } else if (l.lineType === "PROFILE" && l.rawProductId && l.cutLengthMm) {
            const existing = rawAgg.get(l.rawProductId) ?? { productId: l.rawProductId, totalMm: 0 };
            existing.totalMm += l.cutLengthMm * l.quantity;
            rawAgg.set(l.rawProductId, existing);
          }
        }
        // Emit HARDWARE consumes
        for (const { sku, productName, qty } of hwAgg.values()) {
          await applyStockMovement(tx, {
            workshopId: wo.workshopId, sku, productName,
            delta: -qty, type: "WORK_ORDER_CONSUME",
            refType: "WO", refNo: wo.workOrderNo,
            note: `进入 PACKING 自动扣减`,
            operatorName: session.user.name,
          });
        }
        // Emit PROFILE raw bar consumes using the raw material's configured bar length and yield.
        for (const { productId, totalMm } of rawAgg.values()) {
          const raw = await tx.product.findUnique({ where: { id: productId } });
          if (!raw) continue;
          const barMm = Number(raw.lengthMm ?? 3600);
          const yieldRate = Number(raw.yieldRate ?? 0.95);
          const bars = Math.ceil(totalMm / barMm / yieldRate);
          await applyStockMovement(tx, {
            workshopId: wo.workshopId, sku: raw.sku, productName: raw.productName,
            delta: -bars, type: "WORK_ORDER_CONSUME",
            refType: "WO", refNo: wo.workOrderNo,
            note: `PACKING 自动扣减 · 切长合计 ${totalMm}mm / 棒长 ${barMm}mm / 良率 ${yieldRate} = ${bars} 根`,
            operatorName: session.user.name,
          });
        }
      }
    }

      return u;
    }, { timeout: 120_000, maxWait: 120_000 });

    return ok(updated);
  } catch (error: any) {
    return fail(error?.message ?? "加工单状态更新失败");
  }
}

async function getPackingShortages(orderNo: string, workshopId: string) {
  const lines = await prisma.salesOrderLine.findMany({
    where: { orderNo, lineType: { not: "OUTSOURCED" } },
  });
  const required = new Map<string, { sku: string; productName: string; quantity: number }>();
  const rawAgg = new Map<string, { productId: string; totalMm: number }>();

  for (const line of lines) {
    if (line.lineType === "HARDWARE") {
      const existing = required.get(line.sku) ?? { sku: line.sku, productName: line.productName, quantity: 0 };
      existing.quantity += line.quantity;
      required.set(line.sku, existing);
    } else if (line.lineType === "PROFILE" && line.rawProductId && line.cutLengthMm) {
      const existing = rawAgg.get(line.rawProductId) ?? { productId: line.rawProductId, totalMm: 0 };
      existing.totalMm += line.cutLengthMm * line.quantity;
      rawAgg.set(line.rawProductId, existing);
    }
  }

  for (const item of rawAgg.values()) {
    const raw = await prisma.product.findUnique({ where: { id: item.productId } });
    if (!raw) continue;
    const barMm = Number(raw.lengthMm ?? 3600);
    const yieldRate = Number(raw.yieldRate ?? 0.95);
    const bars = Math.ceil(item.totalMm / barMm / yieldRate);
    const existing = required.get(raw.sku) ?? { sku: raw.sku, productName: raw.productName, quantity: 0 };
    existing.quantity += bars;
    required.set(raw.sku, existing);
  }

  const shortages: Array<{ sku: string; required: number; available: number }> = [];
  for (const item of required.values()) {
    const inventory = await prisma.workshopInventory.findUnique({
      where: { workshopId_sku: { workshopId, sku: item.sku } },
    });
    const available = inventory?.quantity ?? 0;
    if (available < item.quantity) shortages.push({ sku: item.sku, required: item.quantity, available });
  }
  return shortages;
}
