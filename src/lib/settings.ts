import { prisma } from "@/lib/prisma";
import { PRICING_CONFIG, LEVEL_DISCOUNT } from "@/lib/pricing";

export type Option = { code: string; label: string; unitPrice?: number };
export type PricingField = { key: string; label: string; value: number; builtin?: boolean };
export type DiscountRates = Record<"A" | "B" | "C" | "D" | "E", number>;
export type ThreeTierDiscount = Record<"A" | "B" | "C", number>;

// Surface: two dropdowns — process × color → combined code
// W1: 补 NP本色/MP磁力抛光/CR镀铬（Base 迁移 18 个颜色选项所需）
export const DEFAULT_SURFACE_PROCESSES: Option[] = [
  { code: "A", label: "硬质阳极氧化" },
  { code: "P", label: "静电喷粉" },
  { code: "W", label: "水性漆喷涂" },
  { code: "T", label: "热转印" },
  { code: "MP", label: "磁力抛光" },
  { code: "CR", label: "镀铬" },
  { code: "NP", label: "本色/无处理" },
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
// W1: 新增 EM 预埋连接件（Base 实证：77% 铝管行需要，与 D 钻/铣销子孔 82% 并列为默认工序）
// D2 工序计价：unitPrice = 该工序单价（元/支），加工费 = Σ勾选工序价；单价先上估计值，外协价到位后修订
export const DEFAULT_PROCESSING_OPERATIONS: Option[] = [
  { code: "L", label: "截断", unitPrice: 1 },
  { code: "D", label: "铣销子孔", unitPrice: 1 },
  { code: "EM", label: "预埋连接件", unitPrice: 1 },
  { code: "T", label: "攻丝", unitPrice: 1 },
  { code: "CH", label: "倒角", unitPrice: 0.5 },
];
export const DEFAULT_DISCOUNT_RATES: DiscountRates = { A: 1.0, B: 0.9, C: 0.8, D: 0.8, E: 0.8 };

export const DEFAULT_CARRIERS: string[] = ["顺丰速运", "德邦物流", "京东物流", "中通快运", "安能物流", "自提"];

export const DEFAULT_PRICING_FIELDS: PricingField[] = [
  { key: "meterWeight", label: "型材米重 (kg/m)", value: PRICING_CONFIG.meterWeight, builtin: true },
  { key: "utilization", label: "截断利用率", value: PRICING_CONFIG.utilization, builtin: true },
  { key: "ingotPrice", label: "铝锭价 (元/吨)", value: PRICING_CONFIG.ingotPrice, builtin: true },
  { key: "extrusionFee", label: "挤压加工费 (元/吨)", value: PRICING_CONFIG.extrusionFee, builtin: true },
  { key: "inputTaxRate", label: "进项税率", value: PRICING_CONFIG.inputTaxRate, builtin: true },
  { key: "materialPrice", label: "素材价 (元/kg)·无行情时回退", value: PRICING_CONFIG.materialPrice, builtin: true },
  { key: "processingFee", label: "加工费 (元/支)·无工序时回退", value: PRICING_CONFIG.processingFee, builtin: true },
  { key: "surfacePricePerKg", label: "表面处理费 (元/kg)", value: PRICING_CONFIG.surfacePricePerKg, builtin: true },
  { key: "connectorFee", label: "连接件费 (元/支)", value: PRICING_CONFIG.connectorFee, builtin: true },
  { key: "packagingFee", label: "包材包装 (元/支)", value: PRICING_CONFIG.packagingFee, builtin: true },
  { key: "grossMarginRate", label: "毛利率（报价加成口径，非财务毛利）", value: PRICING_CONFIG.grossMarginRate, builtin: true },
  { key: "level1Rate", label: "一级代理折扣", value: PRICING_CONFIG.level1Rate, builtin: true },
  { key: "level2Rate", label: "二级代理折扣", value: PRICING_CONFIG.level2Rate, builtin: true },
  { key: "taxRate", label: "含税加成", value: PRICING_CONFIG.taxRate, builtin: true },
];

export type StampTemplate = {
  url: string;
  fileName?: string;
  companyName?: string;
  updatedAt?: string;
};

export type AllSettings = {
  surfaceProcesses: Option[];
  surfaceColors: Option[];
  processingOperations: Option[];
  discountRates: DiscountRates;
  pricingFields: PricingField[];
  carriers: string[];
  stampTemplate: StampTemplate | null;
};

export type PricingConfigMap = { [K in keyof typeof PRICING_CONFIG]: number };

export function pricingFieldsToConfig(fields: PricingField[]): PricingConfigMap {
  const map: any = { ...PRICING_CONFIG };
  for (const f of fields) {
    if (f.key in map) map[f.key] = f.value;
  }
  // 素材价公式化（D1 升级口径）：有行情时素材价 =（铝锭 + 挤压）/1000 ×（1 + 进项税），覆盖手填回退值
  if ((map.ingotPrice ?? 0) > 0) {
    map.materialPrice =
      Math.round(((map.ingotPrice + (map.extrusionFee ?? 0)) / 1000) * (1 + (map.inputTaxRate ?? 0)) * 10000) / 10000;
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
    discountRates: map.get("discountRates") ?? DEFAULT_DISCOUNT_RATES,
    pricingFields: map.get("pricingFields") ?? DEFAULT_PRICING_FIELDS,
    carriers: map.get("carriers") ?? DEFAULT_CARRIERS,
    stampTemplate: (map.get("stampTemplate") as StampTemplate | undefined) ?? null,
  };
}

export async function saveSetting(key: string, value: any, updatedBy?: string) {
  // Prisma requires Prisma.JsonNull for JSON null literals on a non-nullable Json column.
  const { Prisma } = await import("@prisma/client");
  const v = value === null ? Prisma.JsonNull : value;
  return prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: v, updatedBy },
    update: { value: v, updatedBy },
  });
}
