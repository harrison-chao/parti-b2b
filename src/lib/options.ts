export const SURFACE_OPTIONS = [
  { code: "A-SV", label: "阳极氧化 · 银色" },
  { code: "A-BK", label: "阳极氧化 · 黑色" },
  { code: "A-GD", label: "阳极氧化 · 金色" },
  { code: "P-RAL9003", label: "喷粉 · 纯白 RAL9003" },
  { code: "P-RAL9005", label: "喷粉 · 哑黑 RAL9005" },
  { code: "P-RAL7016", label: "喷粉 · 灰色 RAL7016" },
] as const;

export const PROCESSING_OPTIONS = [
  { code: "CUT", label: "标准截断" },
  { code: "CUT-DRILL", label: "截断 + 打孔" },
  { code: "CUT-DRILL-CHAMFER", label: "截断 + 打孔 + 倒角" },
  { code: "CUT-DRILL-TAP", label: "截断 + 打孔 + 攻丝" },
] as const;

export type SurfaceCode = (typeof SURFACE_OPTIONS)[number]["code"];
export type ProcessingCode = (typeof PROCESSING_OPTIONS)[number]["code"];

export function surfaceLabel(code?: string | null) {
  return SURFACE_OPTIONS.find((s) => s.code === code)?.label ?? code ?? "-";
}
export function processingLabel(code?: string | null) {
  return PROCESSING_OPTIONS.find((s) => s.code === code)?.label ?? code ?? "-";
}

export function genCustomSku(series: string, lengthMm: number, surface: string, processing: string) {
  return `C-${series}-${Math.round(lengthMm)}-${surface}-${processing}`;
}

export function genCustomProductName(series: string, lengthMm: number, surface: string) {
  return `${series} 定制 ${Math.round(lengthMm)}mm · ${surfaceLabel(surface)}`;
}
