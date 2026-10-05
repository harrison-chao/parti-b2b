import type { Prisma, PrismaClient, StockMovementType } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Apply a delta to (workshopId, sku) inventory and write a StockMovement row.
 * delta: positive = inbound, negative = outbound. Negative balance is blocked by default.
 * Creates the WorkshopInventory row lazily on first inbound.
 */
export async function applyStockMovement(
  tx: Tx,
  args: {
    workshopId: string;
    sku: string;
    productName: string;
    delta: number;
    type: StockMovementType;
    refType?: string | null;
    refNo?: string | null;
    note?: string | null;
    operatorName?: string | null;
    allowNegative?: boolean;
    // 批次计价：出入库时点的每米成本快照（元/米）——收货写批次价，扣料写当时车间均价
    unitCost?: number | null;
    // 炉批号（收货录入）；调拨/余段回库入向可带随行每米均价直接落到库存档
    batchNo?: string | null;
    avgCostPerMeter?: number | null;
  },
) {
  const { workshopId, sku, productName, delta, type, refType, refNo, note, operatorName, allowNegative, unitCost, batchNo, avgCostPerMeter } = args;

  const existing = await tx.workshopInventory.findUnique({
    where: { workshopId_sku: { workshopId, sku } },
  });

  const newQty = (existing?.quantity ?? 0) + delta;
  if (newQty < 0 && !allowNegative) {
    throw new Error(`库存不足：${sku} 当前 ${existing?.quantity ?? 0}，本次变动 ${delta}，将变为 ${newQty}`);
  }

  if (existing) {
    await tx.workshopInventory.update({
      where: { workshopId_sku: { workshopId, sku } },
      data: {
        quantity: newQty,
        productName,
        ...(avgCostPerMeter != null ? { avgCostPerMeter } : {}),
      },
    });
  } else {
    await tx.workshopInventory.create({
      data: {
        workshopId, sku, productName, quantity: newQty,
        ...(avgCostPerMeter != null ? { avgCostPerMeter } : {}),
      },
    });
  }

  await tx.stockMovement.create({
    data: {
      workshopId,
      sku,
      productName,
      type,
      quantity: delta,
      balanceAfter: newQty,
      refType: refType ?? null,
      refNo: refNo ?? null,
      note: note ?? null,
      operatorName: operatorName ?? null,
      unitCost: unitCost != null ? unitCost : null,
      batchNo: batchNo ?? null,
    },
  });

  return newQty;
}

/** 磅差容忍带：实磅 vs 理论（根×定尺×米重）偏差比例超过它需要人工确认。挤压铝型材行业公差通常 2-5%。 */
export const WEIGHT_TOLERANCE = 0.05;

/** 理论重量 kg = 根数 × 定尺(m) × 米重(kg/m)；缺米重返回 null（无从校验） */
export function theoreticalWeightKg(receiveQty: number, lengthMm: number | null, weightPerMeter: number | null): number | null {
  if (!lengthMm || !weightPerMeter || receiveQty <= 0) return null;
  return Math.round(receiveQty * (lengthMm / 1000) * weightPerMeter * 100) / 100;
}

/** 磅差比例 |实磅-理论|/理论；理论缺失返回 null（跳过校验） */
export function weightDeviation(actualKg: number | null, theoreticalKg: number | null): number | null {
  if (actualKg == null || theoreticalKg == null || theoreticalKg <= 0) return null;
  return Math.abs(actualKg - theoreticalKg) / theoreticalKg;
}

/**
 * 移动加权平均每米成本（批次计价第 2 步核心公式）：
 *   新均价 = (现存米数×旧均价 + 本批米数×本批每米价) ÷ 总米数
 * 旧均价缺失（首次/历史无价）时直接取本批价；本批米数按 根数×定尺 折算（物理事实，磅重只用于结算与校验）。
 */
export function movingAveragePerMeter(
  oldQtyBars: number,
  barMm: number,
  oldAvg: number | null,
  batchBars: number,
  batchPerMeter: number,
): number {
  if (barMm <= 0) return batchPerMeter;
  if (oldAvg == null || oldQtyBars <= 0) return batchPerMeter;
  const oldMeters = oldQtyBars * (barMm / 1000);
  const batchMeters = batchBars * (barMm / 1000);
  const avg = (oldMeters * oldAvg + batchMeters * batchPerMeter) / (oldMeters + batchMeters);
  return Math.round(avg * 10000) / 10000;
}
