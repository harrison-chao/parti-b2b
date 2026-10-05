/**
 * 下单人友好的原料选择（型材 → 表面处理 → 颜色 三级级联）。
 * 内部 SKU 编码（系列-棒长-表面-颜色）与备料棒长由系统解析，不对下单人暴露；
 * 下单人只指定切长，棒长属于备货维度（同截面棒重 = 米重 × 棒长）。
 */

export type MaterialOption = {
  id: string;
  sku: string;
  productName?: string | null;
  series?: string | null;
  lengthMm?: number | null;
  surfaceProcessCode?: string | null;
  surfaceColorCode?: string | null;
  materialStage?: string | null;
};

const norm = (v?: string | null) => (v ?? "").trim().toUpperCase();

/** 型材系列（第一级选择），如 MR2525-9 / R2525 / LY15 */
export function distinctSeries(catalog: MaterialOption[]): string[] {
  return [...new Set(catalog.map((m) => norm(m.series)).filter(Boolean))].sort();
}

/** 该系列可选的表面工艺码；"" 表示无表面处理（如胚料本色类的裸色档案） */
export function processCodesOf(catalog: MaterialOption[], series: string): string[] {
  return [
    ...new Set(catalog.filter((m) => norm(m.series) === norm(series)).map((m) => norm(m.surfaceProcessCode))),
  ].sort();
}

/** 该系列+工艺下可选的颜色码；"" 表示无颜色区分 */
export function colorCodesOf(catalog: MaterialOption[], series: string, processCode: string): string[] {
  return [
    ...new Set(
      catalog
        .filter((m) => norm(m.series) === norm(series) && norm(m.surfaceProcessCode) === norm(processCode))
        .map((m) => norm(m.surfaceColorCode)),
    ),
  ].sort();
}

/** 同一（系列, 工艺, 颜色）下的全部备料变体（不同棒长 / 半成品段） */
export function variantsOf(
  catalog: MaterialOption[],
  series: string,
  processCode: string,
  colorCode: string,
): MaterialOption[] {
  return catalog.filter(
    (m) =>
      norm(m.series) === norm(series) &&
      norm(m.surfaceProcessCode) === norm(processCode) &&
      norm(m.surfaceColorCode) === norm(colorCode),
  );
}

/** 系列+工艺+颜色 → 原料档案：整棒优先、棒长更长优先，半成品段兜底 */
export function resolveMaterial(
  catalog: MaterialOption[],
  series: string,
  processCode: string,
  colorCode: string,
): MaterialOption | null {
  const vs = variantsOf(catalog, series, processCode, colorCode);
  if (!vs.length) return null;
  const bars = vs.filter((m) => m.materialStage !== "SEMI");
  const pool = bars.length ? bars : vs;
  return [...pool].sort((a, b) => (b.lengthMm ?? 0) - (a.lengthMm ?? 0))[0] ?? null;
}

/** 已解析原料的提示文本；withSku=false 供经销商端隐藏内部编码 */
export function materialHint(m: MaterialOption, withSku = true): string {
  const stage = m.materialStage === "SEMI" ? "半成品段" : "备料棒";
  const len = m.lengthMm ? `${(m.lengthMm / 1000).toFixed(1)}m` : "";
  return [withSku ? m.sku : null, len, stage].filter(Boolean).join(" · ");
}

/** 历史行反查：仅凭双码在目录里能唯一定位系列时回填（复制旧单/组合插行用） */
export function guessSeriesByCodes(
  catalog: MaterialOption[],
  processCode?: string | null,
  colorCode?: string | null,
): string | null {
  const series = [
    ...new Set(
      catalog
        .filter((m) => norm(m.surfaceProcessCode) === norm(processCode) && norm(m.surfaceColorCode) === norm(colorCode))
        .map((m) => norm(m.series)),
    ),
  ];
  return series.length === 1 ? series[0] : null;
}
