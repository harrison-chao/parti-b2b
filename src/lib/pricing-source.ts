import { prisma } from "@/lib/prisma";
import type { RawPricingBasis } from "@/lib/pricing";

/**
 * 型材每米成本基数解析（三级回退，批次计价第 1 步）：
 *   AVG      各车间 WorkshopInventory.avgCostPerMeter 的最大值（报价取保守值；多车间各有均价时取高者）
 *   PURCHASE Product.purchasePrice(元/根) ÷ 棒长 —— 手工维护的"最近批次折算价"
 *   SETTINGS 全局常数（perMeterPrice=null，引擎回退旧公式 重量×素材价+表面费）
 * 米重/良率始终优先取 Product（缺省回退全局常数，由 calcPricing 处理）。
 */
export async function resolveRawBasis(raw: {
  sku: string;
  weightPerMeter?: unknown;
  yieldRate?: unknown;
  purchasePrice?: unknown;
  lengthMm?: unknown;
}): Promise<RawPricingBasis> {
  const num = (v: unknown) => {
    const n = v == null ? null : Number(v);
    return n != null && !Number.isNaN(n) && n > 0 ? n : null;
  };
  const meterWeight = num(raw.weightPerMeter);
  const yieldRate = num(raw.yieldRate);

  const invs = await prisma.workshopInventory.findMany({
    where: { sku: raw.sku },
    select: { avgCostPerMeter: true },
  });
  const avgs = invs
    .map((i) => num(i.avgCostPerMeter))
    .filter((v): v is number => v != null);
  if (avgs.length > 0) {
    return { meterWeight, yieldRate, perMeterPrice: Math.max(...avgs), costSource: "AVG" };
  }

  const purchase = num(raw.purchasePrice);
  const barMeters = raw.lengthMm != null ? Number(raw.lengthMm) / 1000 : null;
  if (purchase != null && barMeters && barMeters > 0) {
    const perMeter = Math.round((purchase / barMeters) * 10000) / 10000;
    return { meterWeight, yieldRate, perMeterPrice: perMeter, costSource: "PURCHASE" };
  }
  return { meterWeight, yieldRate, perMeterPrice: null, costSource: "SETTINGS" };
}
