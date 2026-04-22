const DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"];
const UNITS = ["", "拾", "佰", "仟", "万", "拾", "佰", "仟", "亿"];

/** Minimal RMB capitalization, good enough for up to 千万. */
export function numToChinese(n: number): string {
  const fixed = n.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  let result = "";
  const len = intPart.length;
  let zeroStreak = false;
  for (let i = 0; i < len; i++) {
    const d = parseInt(intPart[i], 10);
    const u = len - 1 - i;
    if (d === 0) { zeroStreak = true; if (u === 4) result += "万"; continue; }
    if (zeroStreak) { result += "零"; zeroStreak = false; }
    result += DIGITS[d] + UNITS[u];
  }
  if (!result) result = "零";
  result += "元";
  const jiao = parseInt(decPart[0], 10);
  const fen = parseInt(decPart[1], 10);
  if (jiao === 0 && fen === 0) return result + "整";
  if (jiao > 0) result += DIGITS[jiao] + "角";
  if (fen > 0) result += DIGITS[fen] + "分";
  if (jiao > 0 && fen === 0) result += "整";
  return result;
}

/** Print page base CSS (scoped by nesting into .print-sheet to reduce globals conflict). */
export const PRINT_CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  body { background: #f3f4f6; }
  .print-sheet { max-width: 780px; margin: 24px auto; padding: 32px; background: white; box-shadow: 0 2px 16px rgba(0,0,0,0.08); font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; color: #111; font-size: 13px; line-height: 1.5; }
  .print-sheet .title { text-align: center; font-size: 24px; font-weight: 700; letter-spacing: 4px; margin: 0 0 4px; }
  .print-sheet .subtitle { text-align: center; color: #555; font-size: 12px; margin-bottom: 20px; }
  .print-sheet .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
  .print-sheet .meta .k { color: #666; width: 84px; display: inline-block; }
  .print-sheet .party { border: 1px solid #333; padding: 10px 12px; margin-bottom: 12px; }
  .print-sheet .party h3 { margin: 0 0 6px; font-size: 13px; color: #333; }
  .print-sheet .party .row { display: flex; gap: 14px; margin-bottom: 4px; }
  .print-sheet .party .row .k { color: #666; min-width: 70px; }
  .print-sheet table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 12px; }
  .print-sheet th, .print-sheet td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
  .print-sheet th { background: #f2f2f2; text-align: center; }
  .print-sheet td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .print-sheet td.center { text-align: center; }
  .print-sheet tfoot td { font-weight: 600; background: #fafafa; }
  .print-sheet .terms { line-height: 1.7; margin: 12px 0 20px; font-size: 12px; }
  .print-sheet .terms h3 { font-size: 13px; margin: 16px 0 6px; }
  .print-sheet .terms ol { padding-left: 20px; margin: 0; }
  .print-sheet .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; font-size: 12px; }
  .print-sheet .sign-box { border-top: 1px solid #333; padding-top: 10px; min-height: 140px; position: relative; }
  .print-sheet .sign-box h4 { margin: 0 0 8px; font-size: 13px; }
  .print-sheet .stamp { position: absolute; right: 16px; bottom: 16px; width: 130px; height: 130px; opacity: 0.85; }
  .print-btn { position: fixed; top: 16px; right: 16px; padding: 8px 16px; background: #0f172a; color: white; border: none; border-radius: 6px; cursor: pointer; z-index: 1000; }
  @media print { .print-btn { display: none; } body { background: white; } .print-sheet { box-shadow: none; margin: 0; max-width: 100%; padding: 0; } }
`;

export const PRINT_SCRIPT = `document.getElementById('__print_btn')?.addEventListener('click', () => window.print());`;
