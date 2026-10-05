import { Prisma, type PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

const sanitize = (s: string) => (s ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * 产品 SKU 自动生成（用户决策 2026-10：SKU 编码自动生成，目录里留空即生成；手工填写优先不改写）。
 * 规则（v2：RAW 含棒长——同系列存在 3.6m/4m/6m 多定尺，物理上是不同库存）：
 *   RAW  原料长管   RAW-{系列}-{棒长mm}-{表面码}-{颜色码}    如 RAW-MR2525-9-4000-A-SV
 *   SEMI 半成品段   SEMI-{系列}-{段长mm}-{表面码}-{颜色码}   如 SEMI-MR2525-500-A-BK
 *   型材非原料      P-{系列}
 *   五金           HW-{YYMM}-{3位序号}                     如 HW-2610-001
 * 冲突时尾部追加 -2/-3；系列净化后为空（纯中文等）时退化为 {前缀}-YYMM-NNN。
 */
export async function generateProductSku(
  db: Db,
  input: {
    category: "PROFILE" | "HARDWARE";
    series: string;
    isRawMaterial?: boolean;
    materialStage?: string | null;
    surfaceProcessCode?: string | null;
    surfaceColorCode?: string | null;
    lengthMm?: number | null;
  },
): Promise<string> {
  const series = sanitize(input.series);
  const proc = sanitize(input.surfaceProcessCode ?? "");
  const color = sanitize(input.surfaceColorCode ?? "");
  const yymm = `${String(new Date().getFullYear()).slice(2)}${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  if (input.category === "HARDWARE") {
    const bucket = `HW-${yymm}-`;
    const rows = await db.product.findMany({ where: { sku: { startsWith: bucket } }, select: { sku: true } });
    const max = Math.max(0, ...rows.map((r) => parseInt(r.sku.slice(bucket.length), 10) || 0));
    return freeSku(db, `${bucket}${String(max + 1).padStart(3, "0")}`);
  }

  const prefix = input.isRawMaterial ? (input.materialStage === "SEMI" ? "SEMI" : "RAW") : "P";
  if (!series) {
    return freeSku(db, await nextBucketSku(db, `${prefix}-${yymm}-`));
  }
  const parts = [series];
  if (input.isRawMaterial && input.materialStage !== "SEMI" && input.lengthMm) {
    parts.push(String(Math.round(input.lengthMm)));
  }
  if (input.materialStage === "SEMI" && input.lengthMm) {
    parts.push(String(Math.round(input.lengthMm)));
  }
  if (proc) parts.push(proc);
  if (color) parts.push(color);
  return freeSku(db, `${prefix}-${parts.join("-")}`);
}

/** 尾部序号递增找空位：base → base-2 → base-3 …（手工占用同码时避让） */
export function nextSkuSuffix(candidate: string): string {
  const m = candidate.match(/^(.*)-(\d+)$/);
  return m ? `${m[1]}-${parseInt(m[2], 10) + 1}` : `${candidate}-2`;
}

async function freeSku(db: Db, base: string): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 100; i++) {
    const exists = await db.product.findUnique({ where: { sku: candidate }, select: { sku: true } });
    if (!exists) return candidate;
    candidate = nextSkuSuffix(candidate);
  }
  throw new Error("SKU 自动生成冲突次数过多，请手工填写");
}

async function nextBucketSku(db: Db, bucket: string): Promise<string> {
  const rows = await db.product.findMany({ where: { sku: { startsWith: bucket } }, select: { sku: true } });
  const max = Math.max(0, ...rows.map((r) => parseInt(r.sku.slice(bucket.length), 10) || 0));
  return `${bucket}${String(max + 1).padStart(3, "0")}`;
}
