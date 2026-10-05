/**
 * 表面处理双码的统一读取与旧文本解析（第 3 步 surfaceTreatment 收敛）。
 * 真值顺序：行上的 surfaceProcessCode/surfaceColorCode → 旧 surfaceTreatment 字符串（码-码 或 Base 原文词典）。
 */

// Base 盘点/加工单里的中文颜色原文 → [工艺码, 颜色码]（与设置码表对齐）
const RAW_LEGACY_SURFACE_MAP: Record<string, [string, string | null]> = {
  "grey太空灰色-氧化": ["A", "GY"],
  "silver太空银-氧化": ["A", "SV"],
  "black曜石黑-氧化": ["A", "OB"],
  "gold 古铜金-氧化": ["A", "AG"],
  "gold玫瑰金-氧化": ["A", "RG"],
  "orange活力橙-氧化": ["A", "OR"],
  "darkblue午夜蓝-氧化": ["A", "NB"],
  "blue 冰川蓝-水漆": ["W", "IB"],
  "white 珍珠白-水漆": ["W", "PW"],
  "热转印白橡木纹": ["T", "WO"],
  "镀铬亮银": ["CR", "SV"],
  "定制黄金色-氧化": ["A", "MG"],
  "darkgrey深灰-氧化": ["A", "GY"],
  "胚料本色": ["NP", null],
};

const LEGACY_SURFACE_MAP: Record<string, [string, string | null]> = Object.fromEntries(
  Object.entries(RAW_LEGACY_SURFACE_MAP).map(([k, v]) => [k.replace(/\s+/g, ""), v]),
);

export type SurfaceCodes = { processCode: string | null; colorCode: string | null };

/** 从订单行（或任意带码/旧串的对象）解析表面双码；全部缺失返回 null/null */
export function surfaceCodesOf(line: {
  surfaceProcessCode?: string | null;
  surfaceColorCode?: string | null;
  surfaceTreatment?: string | null;
}): SurfaceCodes {
  if (line.surfaceProcessCode || line.surfaceColorCode) {
    return { processCode: line.surfaceProcessCode ?? null, colorCode: line.surfaceColorCode ?? null };
  }
  const raw = (line.surfaceTreatment ?? "").trim();
  if (!raw) return { processCode: null, colorCode: null };
  const m = raw.match(/^([A-Za-z]{1,8})-([A-Za-z0-9]{1,8})$/);
  if (m) return { processCode: m[1].toUpperCase(), colorCode: m[2].toUpperCase() };
  // 词典键与输入都做去空白归一（全角/双空格变体可命中）
  const dict = LEGACY_SURFACE_MAP[raw.toLowerCase().replace(/\s+/g, "")];
  if (dict) return { processCode: dict[0], colorCode: dict[1] };
  return { processCode: null, colorCode: null };
}

/** 展示文本（读端统一）：优先双码拼 `A-SV`，无码回退旧 surfaceTreatment 原文 */
export function surfaceCodesText(line: {
  surfaceProcessCode?: string | null;
  surfaceColorCode?: string | null;
  surfaceTreatment?: string | null;
}): string | null {
  if (line.surfaceProcessCode || line.surfaceColorCode) {
    return [line.surfaceProcessCode, line.surfaceColorCode].filter(Boolean).join("-") || null;
  }
  return line.surfaceTreatment ?? null;
}

/** 订单行表面与原料档案一致性（第 3 步下单绑定校验）：原料带码时行码必须一致，否则扣错桶 */
export function surfaceMismatch(
  line: { surfaceProcessCode?: string | null; surfaceColorCode?: string | null; surfaceTreatment?: string | null },
  raw: { surfaceProcessCode?: string | null; surfaceColorCode?: string | null },
): string | null {
  const codes = surfaceCodesOf(line);
  if (raw.surfaceProcessCode && codes.processCode !== raw.surfaceProcessCode) {
    return `表面处理与原料不符（原料 ${raw.surfaceProcessCode}，行 ${codes.processCode ?? "未选"}），请选择对应表面的原料 SKU`;
  }
  if (raw.surfaceColorCode && codes.colorCode !== raw.surfaceColorCode) {
    return `颜色与原料不符（原料 ${raw.surfaceColorCode}，行 ${codes.colorCode ?? "未选"}），请选择对应颜色的原料 SKU`;
  }
  return null;
}
