export const PRICING_CONFIG = {
  meterWeight: 0.65,
  utilization: 0.92,
  materialPrice: 28,
  processingFee: 3,
  surfacePricePerKg: 5,
  connectorFee: 10,
  grossMarginRate: 0.65,
  level1Rate: 0.5,
  level2Rate: 0.6,
  taxRate: 1.1,
} as const;

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
  totalCost: number;
  retailPrice: number;
  retailPriceTax: number;
  level1Price: number;
  level2Price: number;
  dealerPrice: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function calcPricing(
  lengthMm: number,
  priceLevel: "A" | "B" | "C" | "D" | "E" = "C",
  config: { [K in keyof typeof PRICING_CONFIG]: number } = PRICING_CONFIG,
  discountRates: Record<"A" | "B" | "C" | "D" | "E", number> = LEVEL_DISCOUNT,
): PricingResult {
  const c = config;
  const theoretical = (lengthMm / 1000) * c.meterWeight;
  const actual = theoretical / c.utilization;
  const waste = actual - theoretical;
  const material = actual * c.materialPrice;
  const surface = actual * c.surfacePricePerKg;
  const processing = c.processingFee;
  const connector = c.connectorFee;
  const totalCost = material + surface + processing + connector;
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
    totalCost: round2(totalCost),
    retailPrice: round2(retail),
    retailPriceTax: round2(retailTax),
    level1Price: round2(level1),
    level2Price: round2(level2),
    dealerPrice: round2(dealerPrice),
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
