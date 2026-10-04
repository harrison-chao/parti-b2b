import { Prisma, PrismaClient } from "@prisma/client";
import { applyStockMovement } from "@/lib/inventory";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * 工单领料扣减：HARDWARE 按 sku 1:1，PROFILE 按原料棒长/良率折算棒数。
 * 幂等：以 WORK_ORDER_CONSUME 流水为准，已扣过则跳过。
 * 正常路径在首次进入 PACKING 时调用；外协直发（工单不经过 PACKING）在发货时补调，
 * 否则外协直发的原料永远不扣、账面库存虚高。
 */
export async function consumeWorkOrderMaterials(
  tx: Tx,
  opts: { workOrderNo: string; orderNo: string; workshopId: string; note: string; operatorName?: string | null },
): Promise<boolean> {
  const already = await tx.stockMovement.count({
    where: { refType: "WO", refNo: opts.workOrderNo, type: "WORK_ORDER_CONSUME" },
  });
  if (already > 0) return false;

  const lines = await tx.salesOrderLine.findMany({
    where: { orderNo: opts.orderNo, lineType: { not: "OUTSOURCED" } },
  });

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

  for (const { sku, productName, qty } of hwAgg.values()) {
    await applyStockMovement(tx, {
      workshopId: opts.workshopId, sku, productName,
      delta: -qty, type: "WORK_ORDER_CONSUME",
      refType: "WO", refNo: opts.workOrderNo,
      note: opts.note,
      operatorName: opts.operatorName ?? null,
    });
  }
  for (const { productId, totalMm } of rawAgg.values()) {
    const raw = await tx.product.findUnique({ where: { id: productId } });
    if (!raw) continue;
    const barMm = Number(raw.lengthMm ?? 3600);
    const yieldRate = Number(raw.yieldRate ?? 0.95);
    const bars = Math.ceil(totalMm / barMm / yieldRate);
    await applyStockMovement(tx, {
      workshopId: opts.workshopId, sku: raw.sku, productName: raw.productName,
      delta: -bars, type: "WORK_ORDER_CONSUME",
      refType: "WO", refNo: opts.workOrderNo,
      note: `${opts.note} · 切长合计 ${totalMm}mm / 棒长 ${barMm}mm / 良率 ${yieldRate} = ${bars} 根`,
      operatorName: opts.operatorName ?? null,
    });
  }
  return true;
}
