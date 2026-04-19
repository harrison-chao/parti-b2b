import { prisma } from "@/lib/prisma";
import { PRICING_CONFIG, LEVEL_DISCOUNT } from "@/lib/pricing";

export const DEFAULT_SURFACE_OPTIONS = [
  { code: "A-SV", label: "阳极氧化 · 银色" },
  { code: "A-BK", label: "阳极氧化 · 黑色" },
  { code: "A-GD", label: "阳极氧化 · 金色" },
  { code: "P-RAL9003", label: "喷粉 · 纯白 RAL9003" },
  { code: "P-RAL9005", label: "喷粉 · 哑黑 RAL9005" },
  { code: "P-RAL7016", label: "喷粉 · 灰色 RAL7016" },
];

export const DEFAULT_PROCESSING_OPTIONS = [
  { code: "CUT", label: "标准截断" },
  { code: "CUT-DRILL", label: "截断 + 打孔" },
  { code: "CUT-DRILL-CHAMFER", label: "截断 + 打孔 + 倒角" },
  { code: "CUT-DRILL-TAP", label: "截断 + 打孔 + 攻丝" },
];

export const DEFAULT_DISCOUNT_RATES = { A: 1.0, B: 0.95, C: 0.9, D: 0.85, E: 0.8 };

export type PricingConfigMap = { [K in keyof typeof PRICING_CONFIG]: number };
export const DEFAULT_PRICING_CONFIG: PricingConfigMap = { ...PRICING_CONFIG };

export type SurfaceOption = { code: string; label: string };
export type ProcessingOption = { code: string; label: string };
export type DiscountRates = Record<"A" | "B" | "C" | "D" | "E", number>;
export type PricingConfig = PricingConfigMap;

export type AllSettings = {
  surfaceOptions: SurfaceOption[];
  processingOptions: ProcessingOption[];
  discountRates: DiscountRates;
  pricingConfig: PricingConfig;
};

export async function loadSettings(): Promise<AllSettings> {
  const rows = await prisma.systemSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value as any]));
  return {
    surfaceOptions: map.get("surfaceOptions") ?? DEFAULT_SURFACE_OPTIONS,
    processingOptions: map.get("processingOptions") ?? DEFAULT_PROCESSING_OPTIONS,
    discountRates: map.get("discountRates") ?? DEFAULT_DISCOUNT_RATES,
    pricingConfig: map.get("pricingConfig") ?? DEFAULT_PRICING_CONFIG,
  };
}

export async function saveSetting(key: string, value: any, updatedBy?: string) {
  return prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
}
