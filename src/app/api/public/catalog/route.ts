import { prisma } from "@/lib/prisma";
import { loadSettings, pricingFieldsToConfig } from "@/lib/settings";
import { ok } from "@/lib/api";

// 目录随 settings/产品库实时变化（调价即生效），禁用 Next 对无请求参数 GET 的静态缓存
export const dynamic = "force-dynamic";

/**
 * 对外报价计算器的目录下发接口（免登录）：
 *  - hardware：ERP 五金目录（仅活跃且有零售价的项）
 *  - surfaceProcesses / surfaceColors：表面处理选项（与下单同源）
 *  - profile：型材零售系数（服务端按当前参数折算，只给最终系数，
 *    不暴露成本构成/毛利率——客户端零成本信息）
 * 基准原料 SKU：第一个有米重的活跃原料（MR2525），系数口径 = 纯切长 L + 预埋 EM（含连接件+组装）。
 */
export async function GET() {
  const settings = await loadSettings();
  const cfg = pricingFieldsToConfig(settings.pricingFields);

  const [hardware, raw] = await Promise.all([
    prisma.product.findMany({
      where: { category: "HARDWARE", isActive: true },
      select: { sku: true, productName: true, spec: true, unit: true, retailPrice: true },
      orderBy: { sku: "asc" },
    }),
    prisma.product.findFirst({
      // 锁定 MR2525 系列（series 形如 MR2525/8、MR2525/9；防按 SKU 序误取 LY15 等异系列）
      where: { series: { startsWith: "MR2525" }, category: "PROFILE", isRawMaterial: true, isActive: true, weightPerMeter: { not: null } },
      select: { weightPerMeter: true, yieldRate: true },
      orderBy: { sku: "asc" },
    }),
  ]);

  const mw = Number(raw?.weightPerMeter ?? cfg.meterWeight);
  const yl = Number(raw?.yieldRate ?? cfg.utilization) || cfg.utilization;
  const opPrice = (code: string) =>
    (settings.processingOperations ?? []).find((o) => o.code === code)?.unitPrice ?? 0;

  const margin = 1 - cfg.grossMarginRate;
  const perMeterRetail = (mw / yl) * (cfg.materialPrice + cfg.surfacePricePerKg) / margin;
  const fixedPerPcRetail = (opPrice("L") + opPrice("D") + opPrice("EM") + cfg.connectorFee + cfg.packagingFee) / margin;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return ok({
    version: new Date().toISOString().slice(0, 10),
    hardware: hardware
      .filter((h) => Number(h.retailPrice) > 0)
      .map((h) => ({ sku: h.sku, name: h.productName, spec: h.spec ?? "", unit: h.unit ?? "件", price: Number(h.retailPrice) })),
    surfaceProcesses: settings.surfaceProcesses,
    surfaceColors: settings.surfaceColors,
    profile: {
      perMeterRetail: round2(perMeterRetail),
      fixedPerPcRetail: round2(fixedPerPcRetail),
      taxOut: cfg.taxRate,
    },
  });
}
