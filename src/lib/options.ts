export function surfaceLabel(code?: string | null) {
  return code ?? "-";
}
export function processingLabel(code?: string | null) {
  return code ?? "-";
}

export function genCustomSku(series: string, lengthMm: number, surface: string, processing: string) {
  const parts = [`C-${series}`, `L${Math.round(lengthMm)}MM`, surface];
  if (processing) parts.push(processing);
  return parts.filter(Boolean).join("-");
}

export function genCustomProductName(series: string, lengthMm: number, surfaceLabelText: string) {
  return `${series} 定制 ${Math.round(lengthMm)}mm · ${surfaceLabelText}`;
}
