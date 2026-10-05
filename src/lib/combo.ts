import { PrismaClient } from "@prisma/client";

export type ComboLine = {
  lineType: "PROFILE" | "HARDWARE";
  rawProductId?: string | null;
  productId?: string | null;
  sku: string;
  productName: string;
  cutLengthMm?: number | null;
  processCodes: string[];
  surfaceProcessCode?: string | null;
  surfaceColorCode?: string | null;
  quantity: number;
};

export function comboLineSignature(l: ComboLine): string {
  return [
    l.lineType,
    l.sku,
    l.cutLengthMm ?? "",
    [...l.processCodes].sort().join("+"),
    l.surfaceProcessCode ?? "",
    l.surfaceColorCode ?? "",
  ].join("|");
}

export function comboSignature(lines: ComboLine[]): string {
  return lines.map(comboLineSignature).sort().join(";;");
}

/** 众数（出现最多的数量），用于组合的建议数量 */
function mode<T>(arr: T[]): T | undefined {
  const m = new Map<T, number>();
  for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
  let best: T | undefined, n = 0;
  for (const [k, v] of m) if (v > n) { best = k; n = v; }
  return best;
}

/**
 * W2: 从历史订单归集常用组合候选（Base 实证：69% 的行落在重复组合）。
 *  - 整单签名重复 ≥2 次 → 多行套装
 *  - 单行规格出现 ≥3 次 → 单行常用规格
 * 幂等：已存在同签名的组合跳过。
 */
export async function generateCombosFromHistory(prisma: PrismaClient, opts?: { maxTotal?: number }): Promise<{ created: number; skipped: number }> {
  const maxTotal = opts?.maxTotal ?? 30;
  // 停用原料不进组合（表面化迁移后旧裸料已停用；防归集重新吸入死引用）
  const inactiveRaws = new Set(
    (await prisma.product.findMany({ where: { isActive: false }, select: { id: true } })).map((p) => p.id),
  );
  const orders = await prisma.salesOrder.findMany({
    where: { orderStatus: { notIn: ["REJECTED", "CANCELLED"] } },
    include: { lines: { where: { lineType: { not: "OUTSOURCED" } }, orderBy: { lineNo: "asc" } } },
    orderBy: { orderDate: "asc" },
  });

  const toComboLine = (l: (typeof orders)[number]["lines"][number]): ComboLine => ({
    lineType: l.lineType as "PROFILE" | "HARDWARE",
    rawProductId: l.rawProductId, productId: l.productId,
    sku: l.sku, productName: l.productName,
    cutLengthMm: l.cutLengthMm, processCodes: [...l.processCodes],
    surfaceProcessCode: l.surfaceProcessCode, surfaceColorCode: l.surfaceColorCode,
    quantity: l.quantity,
  });

  // 整单签名频次 + 单行规格频次
  const orderSig = new Map<string, { orders: typeof orders; lines: ComboLine[][] }>();
  const lineSig = new Map<string, { count: number; qty: number[]; sample: ComboLine }>();
  for (const o of orders) {
    const cls = o.lines.map(toComboLine);
    if (!cls.length) continue;
    if (cls.some((l) => l.rawProductId && inactiveRaws.has(l.rawProductId))) continue; // 含停用原料的单不归集
    const sig = comboSignature(cls);
    if (!orderSig.has(sig)) orderSig.set(sig, { orders: [], lines: [] });
    orderSig.get(sig)!.orders.push(o);
    orderSig.get(sig)!.lines.push(cls);
    for (const cl of cls) {
      const s = comboLineSignature(cl);
      if (!lineSig.has(s)) lineSig.set(s, { count: 0, qty: [], sample: cl });
      const e = lineSig.get(s)!;
      e.count += 1; e.qty.push(cl.quantity);
    }
  }

  // 候选：多行套装优先，凑满 maxTotal 后补单行高频
  type Cand = { name: string; lines: ComboLine[]; signature: string; freq: number };
  const cands: Cand[] = [];
  for (const [sig, e] of orderSig) {
    if (e.orders.length < 2) continue;
    if (e.lines[0].length < 2) continue; // 单行单走单行候选
    // 建议数量取各行的众数
    const n = e.lines[0].length;
    const qtyPerLine: number[] = [];
    for (let i = 0; i < n; i++) {
      const qs = e.lines.map((ls) => ls[i].quantity);
      qtyPerLine.push(mode(qs) ?? qs[qs.length - 1]);
    }
    const lines = e.lines[e.lines.length - 1].map((l, i) => ({ ...l, quantity: qtyPerLine[i] }));
    const first = lines[0];
    cands.push({
      name: `${first.sku}${first.cutLengthMm ? " " + first.cutLengthMm + "mm" : ""} 等${lines.length}行套装`,
      lines, signature: sig, freq: e.orders.length,
    });
  }
  cands.sort((a, b) => b.freq - a.freq);
  let picked = cands.slice(0, maxTotal);
  if (picked.length < maxTotal) {
    const single: Cand[] = [];
    for (const [s, e] of lineSig) {
      if (e.count < 3) continue;
      single.push({
        name: `${e.sample.sku}${e.sample.cutLengthMm ? " " + e.sample.cutLengthMm + "mm" : ""} ×${mode(e.qty) ?? e.sample.quantity}`,
        lines: [{ ...e.sample, quantity: mode(e.qty) ?? e.sample.quantity }],
        signature: s, freq: e.count,
      });
    }
    single.sort((a, b) => b.freq - a.freq);
    picked = [...picked, ...single.slice(0, maxTotal - picked.length)];
  }

  let created = 0, skipped = 0;
  for (const c of picked) {
    const exist = await prisma.orderCombo.findUnique({ where: { signature: c.signature } });
    if (exist) { skipped++; continue; }
    await prisma.orderCombo.create({
      data: { name: c.name, lines: c.lines as any, signature: c.signature, source: "auto-history" },
    });
    created++;
  }
  return { created, skipped };
}
