import { prisma } from "@/lib/prisma";
import { PRICING_CONFIG, LEVEL_DISCOUNT } from "@/lib/pricing";

export type Option = { code: string; label: string };
export type PricingField = { key: string; label: string; value: number; builtin?: boolean };
export type DiscountRates = Record<"A" | "B" | "C" | "D" | "E", number>;

// Surface: two dropdowns — process × color → combined code
export const DEFAULT_SURFACE_PROCESSES: Option[] = [
  { code: "A", label: "硬质阳极氧化" },
  { code: "P", label: "静电喷粉" },
  { code: "W", label: "水性漆喷涂" },
  { code: "T", label: "热转印" },
];
export const DEFAULT_SURFACE_COLORS: Option[] = [
  { code: "SV", label: "太空银" },
  { code: "GY", label: "太空灰" },
  { code: "BK", label: "太空黑" },
  { code: "NB", label: "午夜蓝" },
  { code: "OB", label: "曜石黑" },
  { code: "OR", label: "活力橙" },
  { code: "RG", label: "玫瑰金" },
  { code: "AG", label: "古铜金" },
  { code: "MG", label: "中东金" },
  { code: "WO", label: "白橡木色" },
  { code: "BW", label: "黑胡桃色" },
  { code: "IB", label: "冰川蓝" },
  { code: "PW", label: "珍珠白" },
  { code: "JG", label: "翡翠绿" },
  { code: "RAL9003", label: "纯白 RAL9003" },
  { code: "RAL9005", label: "哑黑 RAL9005" },
  { code: "RAL7016", label: "灰色 RAL7016" },
];
// Processing: two dropdowns — operation × modifier
export const DEFAULT_PROCESSING_OPERATIONS: Option[] = [
  { code: "L", label: "截断" },
  { code: "D", label: "钻销子孔" },
  { code: "T", label: "攻丝" },
  { code: "CH", label: "倒角" },
];
export const DEFAULT_PROCESSING_MODIFIERS: Option[] = [
  { code: "600MM", label: "600mm" },
  { code: "800MM", label: "800mm" },
  { code: "8IN", label: "8 英寸" },
  { code: "10IN", label: "10 英寸" },
  { code: "24IN", label: "24 英寸" },
];

export const DEFAULT_DISCOUNT_RATES: DiscountRates = { A: 1.0, B: 0.95, C: 0.9, D: 0.85, E: 0.8 };

export const DEFAULT_CARRIERS: string[] = ["顺丰速运", "德邦物流", "京东物流", "中通快运", "安能物流", "自提"];

export const DEFAULT_PRICING_FIELDS: PricingField[] = [
  { key: "meterWeight", label: "型材米重 (kg/m)", value: PRICING_CONFIG.meterWeight, builtin: true },
  { key: "utilization", label: "截断利用率", value: PRICING_CONFIG.utilization, builtin: true },
  { key: "materialPrice", label: "素材价格 (元/kg)", value: PRICING_CONFIG.materialPrice, builtin: true },
  { key: "processingFee", label: "加工费 (元/支)", value: PRICING_CONFIG.processingFee, builtin: true },
  { key: "surfacePricePerKg", label: "表面处理费 (元/kg)", value: PRICING_CONFIG.surfacePricePerKg, builtin: true },
  { key: "connectorFee", label: "连接件费 (元/支)", value: PRICING_CONFIG.connectorFee, builtin: true },
  { key: "grossMarginRate", label: "毛利率", value: PRICING_CONFIG.grossMarginRate, builtin: true },
  { key: "level1Rate", label: "一级代理折扣", value: PRICING_CONFIG.level1Rate, builtin: true },
  { key: "level2Rate", label: "二级代理折扣", value: PRICING_CONFIG.level2Rate, builtin: true },
  { key: "taxRate", label: "含税加成", value: PRICING_CONFIG.taxRate, builtin: true },
];

export type AllSettings = {
  surfaceProcesses: Option[];
  surfaceColors: Option[];
  processingOperations: Option[];
  processingModifiers: Option[];
  discountRates: DiscountRates;
  pricingFields: PricingField[];
  carriers: string[];
};

export type PricingConfigMap = { [K in keyof typeof PRICING_CONFIG]: number };

export function pricingFieldsToConfig(fields: PricingField[]): PricingConfigMap {
  const map: any = { ...PRICING_CONFIG };
  for (const f of fields) {
    if (f.key in map) map[f.key] = f.value;
  }
  return map;
}

export async function loadSettings(): Promise<AllSettings> {
  const rows = await prisma.systemSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value as any]));

  // Migration: if legacy surfaceOptions / processingOptions exist, they're ignored
  // in favour of new-shape keys. Defaults fill in when absent.
  return {
    surfaceProcesses: map.get("surfaceProcesses") ?? DEFAULT_SURFACE_PROCESSES,
    surfaceColors: map.get("surfaceColors") ?? DEFAULT_SURFACE_COLORS,
    processingOperations: map.get("processingOperations") ?? DEFAULT_PROCESSING_OPERATIONS,
    processingModifiers: map.get("processingModifiers") ?? DEFAULT_PROCESSING_MODIFIERS,
    discountRates: map.get("discountRates") ?? DEFAULT_DISCOUNT_RATES,
    pricingFields: map.get("pricingFields") ?? DEFAULT_PRICING_FIELDS,
    carriers: map.get("carriers") ?? DEFAULT_CARRIERS,
  };
}

export async function saveSetting(key: string, value: any, updatedBy?: string) {
  return prisma.systemSetting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  });
}
