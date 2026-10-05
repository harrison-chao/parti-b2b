import { Prisma, PrismaClient } from "@prisma/client";
import { applyStockMovement } from "@/lib/inventory";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * 棒数折算单一实现：Σ切长 ÷ (棒长×良率) 向上取整。
 * 扣料（consumeWorkOrderMaterials）与需求聚合（aggregateOrderRequirements）必须同口径，禁止各写一份。
 * 半成品段（SEMI）不适用：段不可拼接，按件折段 = Σ行 ceil(数量 ÷ 每段可切段数)，良率不重复计提（已切定长）。
 */
export function barsFor(totalMm: number, raw: { lengthMm: unknown; yieldRate: unknown }) {
  const barMm = Number(raw.lengthMm ?? 3600);
  const yieldRate = Number(raw.yieldRate ?? 0.95);
  return { bars: Math.ceil(totalMm / barMm / yieldRate), barMm, yieldRate };
}

/** SEMI 按件折段：一段最多出 floor(段长/切长) 件，每行 ceil(数量/可出件数) 段 */
export function semiSegmentsFor(barMm: number, cutMm: number, qty: number): number {
  const perSegment = Math.max(1, Math.floor(barMm / Math.max(1, cutMm)));
  return Math.ceil(qty / perSegment);
}

type ProfileAgg = { productId: string; totalMm: number; semiPieces: number };

/** 订单行 → 用料聚合（consume 与 demand 共用）：RAW 累计切长，SEMI 按件折段 */
async function aggregateProfileLines(tx: Tx, orderNo: string) {
  const lines = await tx.salesOrderLine.findMany({
    where: { orderNo, lineType: { not: "OUTSOURCED" } },
  });
  const rawIds = [...new Set(lines.filter((l) => l.rawProductId).map((l) => l.rawProductId!))];
  const productMap = new Map(
    rawIds.length
      ? (await tx.product.findMany({ where: { id: { in: rawIds } } })).map((p) => [p.id, p])
      : [],
  );

  const hwAgg = new Map<string, { sku: string; productName: string; qty: number }>();
  const rawAgg = new Map<string, ProfileAgg>();
  for (const l of lines) {
    if (l.lineType === "HARDWARE") {
      const existing = hwAgg.get(l.sku) ?? { sku: l.sku, productName: l.productName, qty: 0 };
      existing.qty += l.quantity;
      hwAgg.set(l.sku, existing);
    } else if (l.lineType === "PROFILE" && l.rawProductId && l.cutLengthMm) {
      const p = productMap.get(l.rawProductId);
      const existing = rawAgg.get(l.rawProductId) ?? { productId: l.rawProductId, totalMm: 0, semiPieces: 0 };
      if (p?.materialStage === "SEMI") {
        const barMm = p.lengthMm != null ? Number(p.lengthMm) : 0;
        existing.semiPieces += barMm > 0 ? semiSegmentsFor(barMm, l.cutLengthMm, l.quantity) : l.quantity;
      } else {
        existing.totalMm += l.cutLengthMm * l.quantity;
      }
      rawAgg.set(l.rawProductId, existing);
    }
  }
  return { lines, hwAgg, rawAgg, productMap };
}

/**
 * 工单领料扣减：HARDWARE 按 sku 1:1；PROFILE 原料长管按棒长/良率折棒数，半成品段按件折段（良率=1）。
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

  const { hwAgg, rawAgg, productMap } = await aggregateProfileLines(tx, opts.orderNo);

  // 扣料时的每米均价快照（供 ABC 消耗价值/成本回放；与 schema 注释口径一致）
  const avgBySku = new Map(
    (await tx.workshopInventory.findMany({
      where: { workshopId: opts.workshopId, sku: { in: [...hwAgg.keys(), ...rawAgg.keys()] } },
      select: { sku: true, avgCostPerMeter: true },
    })).map((r) => [r.sku, r.avgCostPerMeter != null ? Number(r.avgCostPerMeter) : null]),
  );

  for (const { sku, productName, qty } of hwAgg.values()) {
    await applyStockMovement(tx, {
      workshopId: opts.workshopId, sku, productName,
      delta: -qty, type: "WORK_ORDER_CONSUME",
      refType: "WO", refNo: opts.workOrderNo,
      note: opts.note,
      operatorName: opts.operatorName ?? null,
    });
  }
  for (const agg of rawAgg.values()) {
    const raw = productMap.get(agg.productId);
    if (!raw) continue;
    const isSemi = raw.materialStage === "SEMI";
    const bars = isSemi
      ? agg.semiPieces
      : barsFor(agg.totalMm, raw).bars;
    const note = isSemi
      ? `${opts.note} · 半成品段 × ${agg.semiPieces} 段（段长 ${Number(raw.lengthMm)}mm）`
      : `${opts.note} · 切长合计 ${agg.totalMm}mm / 棒长 ${barsFor(agg.totalMm, raw).barMm}mm / 良率 ${barsFor(agg.totalMm, raw).yieldRate} = ${bars} 根`;
    await applyStockMovement(tx, {
      workshopId: opts.workshopId, sku: raw.sku, productName: raw.productName,
      delta: -bars, type: "WORK_ORDER_CONSUME",
      refType: "WO", refNo: opts.workOrderNo,
      note,
      operatorName: opts.operatorName ?? null,
      unitCost: avgBySku.get(raw.sku) ?? null,
    });
  }
  return true;
}

/**
 * 订单用料需求聚合（sku → 数量）。HARDWARE 按 sku 1:1；PROFILE 与 consumeWorkOrderMaterials 完全同口径。
 */
export async function aggregateOrderRequirements(
  tx: Tx,
  orderNo: string,
): Promise<Map<string, { productName: string; quantity: number }>> {
  const { hwAgg, rawAgg, productMap } = await aggregateProfileLines(tx, orderNo);
  const required = new Map<string, { productName: string; quantity: number }>();

  for (const { sku, productName, qty } of hwAgg.values()) {
    required.set(sku, { productName, quantity: qty });
  }
  for (const agg of rawAgg.values()) {
    const raw = productMap.get(agg.productId);
    if (!raw) continue;
    const bars = raw.materialStage === "SEMI" ? agg.semiPieces : barsFor(agg.totalMm, raw).bars;
    const existing = required.get(raw.sku) ?? { productName: raw.productName, quantity: 0 };
    existing.quantity += bars;
    required.set(raw.sku, existing);
  }
  return required;
}

/** 缺料检查：需求 vs 指定车间库存。用于派单/开工前置（B1 前移），PACKING 处保留为最后防线。 */
export async function getMaterialShortages(
  tx: Tx,
  orderNo: string,
  workshopId: string,
): Promise<Array<{ sku: string; productName: string; required: number; available: number }>> {
  const required = await aggregateOrderRequirements(tx, orderNo);
  const shortages: Array<{ sku: string; productName: string; required: number; available: number }> = [];
  // 一次批量取齐本车间相关 SKU 库存，替代逐 SKU findUnique
  const invRows = await tx.workshopInventory.findMany({
    where: { workshopId, sku: { in: [...required.keys()] } },
    select: { sku: true, quantity: true },
  });
  const invBySku = new Map(invRows.map((r) => [r.sku, r.quantity]));
  for (const [sku, item] of required.entries()) {
    const available = invBySku.get(sku) ?? 0;
    if (available < item.quantity) {
      shortages.push({ sku, productName: item.productName, required: item.quantity, available });
    }
  }
  return shortages;
}

export function formatShortages(shortages: Array<{ sku: string; required: number; available: number }>): string {
  return shortages.map((item) => `${item.sku} 需 ${item.required}，现有 ${item.available}`).join("；");
}
