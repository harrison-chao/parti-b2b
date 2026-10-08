export const PRICING_CONFIG = {
  meterWeight: 0.65,
  utilization: 0.92,
  // 行情三件套：素材价 =（铝锭 + 挤压加工）/1000 ×（1 + 进项税），缺行情时回退 materialPrice 常数
  ingotPrice: 24600,
  extrusionFee: 1300,
  inputTaxRate: 0.09,
  materialPrice: 28,
  processingFee: 3,
  surfacePricePerKg: 5.5,
  connectorFee: 10,
  packagingFee: 0.3,
  grossMarginRate: 0.6,
  level1Rate: 0.5,
  level2Rate: 0.6,
  taxRate: 1.1,
} as const;

/**
 * 工序计价（D2/D3）：codes 传入时加工费 = Σ勾选工序单价，连接件+组装仅在勾 EM 时计收；
 * codes 不传时回退旧行为（固定加工费 + 每行连接件费），兼容存量调用。
 */
export type OpPricing = { codes?: string[]; prices?: Record<string, number> };

export type PriceTier = "A" | "B" | "C";
export const PRICE_TIERS: PriceTier[] = ["A", "B", "C"];
export const PRICE_TIER_LABEL: Record<PriceTier, string> = {
  A: "战略伙伴级",
  B: "渠道共建级",
  C: "先锋共创者级",
};
// Retained legacy record shape for back-compat; D/E kept as aliases to C after migration.
export const LEVEL_DISCOUNT: Record<"A" | "B" | "C" | "D" | "E", number> = {
  A: 1.0,
  B: 0.9,
  C: 0.8,
  D: 0.8,
  E: 0.8,
};

export type PricingResult = {
  lengthMm: number;
  theoreticalWeight: number;
  wasteWeight: number;
  actualWeight: number;
  materialCost: number;
  processingCost: number;
  surfaceCost: number;
  connectorCost: number;
  packagingCost: number;
  totalCost: number;
  retailPrice: number;
  retailPriceTax: number;
  level1Price: number;
  level2Price: number;
  dealerPrice: number;
  // 第 1 步口径切换：SKU 级参数与成本来源（AVG=移动加权均价 / PURCHASE=采购价折算 / SETTINGS=全局常数回退）
  meterWeight: number;
  yieldRate: number;
  perMeterPrice: number | null;
  costSource: "AVG" | "PURCHASE" | "SETTINGS";
};

/**
 * 型材行的 SKU 级成本基数（由 resolveRawBasis 解析后传入）：
 *  - perMeterPrice 有值（AVG/PURCHASE）：材料成本 = 切长÷良率 × 每米价，表面费不单列（原料已含表面处理）
 *  - perMeterPrice 为 null（SETTINGS）：回退全局常数 重量×素材价+表面费（旧行为）
 *  - 良率单源：Product.yieldRate 优先，缺省才用全局 utilization
 */
export type RawPricingBasis = {
  meterWeight?: number | null;
  yieldRate?: number | null;
  perMeterPrice?: number | null;
  costSource?: "AVG" | "PURCHASE" | "SETTINGS";
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function calcPricing(
  lengthMm: number,
  priceLevel: "A" | "B" | "C" | "D" | "E" = "C",
  config: { [K in keyof typeof PRICING_CONFIG]: number } = PRICING_CONFIG,
  discountRates: Record<"A" | "B" | "C" | "D" | "E", number> = LEVEL_DISCOUNT,
  raw?: RawPricingBasis,
  ops?: OpPricing,
): PricingResult {
  const c = config;
  const meterWeight = raw?.meterWeight ?? c.meterWeight;
  const yieldRate = raw?.yieldRate ?? c.utilization;
  const theoretical = (lengthMm / 1000) * meterWeight;
  const actual = theoretical / yieldRate;
  const waste = actual - theoretical;
  let material: number;
  let surface: number;
  let perMeterPrice: number | null = null;
  let costSource: "AVG" | "PURCHASE" | "SETTINGS" = "SETTINGS";
  if (raw?.perMeterPrice != null && raw.perMeterPrice > 0) {
    perMeterPrice = round4(raw.perMeterPrice);
    costSource = raw.costSource ?? "AVG";
    material = ((lengthMm / 1000) / yieldRate) * perMeterPrice;
    // 口径更新 2026-10-08：素材价（采购/均价）为裸管口径，表面处理独立按重量计价
    surface = actual * c.surfacePricePerKg;
  } else {
    material = actual * c.materialPrice;
    surface = actual * c.surfacePricePerKg;
  }
  const codes0 = ops?.codes;
  // EM(预埋连接件)默认已含截断与铣销子孔——计价时自动并入 L/D,无需重复勾选
  const codes = codes0?.includes("EM") ? Array.from(new Set([...codes0, "L", "D"])) : codes0;
  const processing = codes
    ? codes.reduce((sum, cd) => sum + (ops?.prices?.[cd] ?? 0), 0)
    : c.processingFee;
  const connector = codes
    ? (codes.includes("EM") ? c.connectorFee : 0)
    : c.connectorFee;
  const packaging = c.packagingFee;
  const totalCost = material + surface + processing + connector + packaging;
  const retail = totalCost / (1 - c.grossMarginRate);
  const retailTax = retail * c.taxRate;
  const level1 = retail * c.level1Rate;
  const level2 = retail * c.level2Rate;
  const dealerPrice = retail * discountRates[priceLevel];

  return {
    lengthMm: round2(lengthMm),
    theoreticalWeight: round3(theoretical),
    wasteWeight: round3(waste),
    actualWeight: round3(actual),
    materialCost: round2(material),
    processingCost: round2(processing),
    surfaceCost: round2(surface),
    connectorCost: round2(connector),
    packagingCost: round2(packaging),
    totalCost: round2(totalCost),
    retailPrice: round2(retail),
    retailPriceTax: round2(retailTax),
    level1Price: round2(level1),
    level2Price: round2(level2),
    dealerPrice: round2(dealerPrice),
    meterWeight: round4(meterWeight),
    yieldRate: round4(yieldRate),
    perMeterPrice,
    costSource,
  };
}

export const STANDARD_SPECS_MR2525 = [
  { inch: 8, mm: 203.2 },
  { inch: 10, mm: 254.0 },
  { inch: 11, mm: 279.4 },
  { inch: 13, mm: 330.2 },
  { inch: 16, mm: 406.4 },
  { inch: 20, mm: 508.0 },
  { inch: 24, mm: 609.6 },
  { inch: 28, mm: 711.2 },
  { inch: 30, mm: 762.0 },
];
