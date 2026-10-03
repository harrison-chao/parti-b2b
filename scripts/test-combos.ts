/**
 * W2c: 常用组合归集测试（跑在含 Base 774 条迁移数据的库上）。
 * 验证：归集产出 > 0、签名唯一、幂等（二次运行 created=0）、数量字段有效。
 */
import { PrismaClient } from "@prisma/client";
import { generateCombosFromHistory, comboSignature, type ComboLine } from "../src/lib/combo";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log(`✓ ${label}`); } else { fail++; console.log(`✗ ${label}${detail !== undefined ? " — " + String(detail) : ""}`); }
};

async function main() {
  // 自清理：删除 auto-history 组合，保证测试可重复运行（manual 收藏保留）
  await prisma.orderCombo.deleteMany({ where: { source: "auto-history" } });
  const before = await prisma.orderCombo.count();
  const r1 = await generateCombosFromHistory(prisma);
  const after1 = await prisma.orderCombo.count();
  check("first run created > 0 on real data", r1.created > 0, JSON.stringify(r1));
  check("db count increased accordingly", after1 === before + r1.created, `${before}→${after1}`);

  const r2 = await generateCombosFromHistory(prisma);
  check("idempotent (second run creates 0)", r2.created === 0, JSON.stringify(r2));

  const combos = await prisma.orderCombo.findMany();
  const sigs = new Set(combos.map((c) => c.signature));
  check("signatures unique in db", sigs.size === combos.length, `${sigs.size}/${combos.length}`);
  for (const c of combos) {
    const lines = c.lines as ComboLine[];
    if (!Array.isArray(lines) || !lines.length) { check(`combo ${c.name} lines valid`, false); continue; }
    check(`combo ${c.name} signature matches content`, comboSignature(lines) === c.signature);
  }
  const withQty = combos.every((c) => (c.lines as ComboLine[]).every((l) => Number.isInteger(l.quantity) && l.quantity > 0));
  check("all line quantities positive ints", withQty);
  const multi = combos.filter((c) => (c.lines as ComboLine[]).length > 1);
  console.log(`  （组合构成：多行套装 ${multi.length} / 单行规格 ${combos.length - multi.length}）`);
  check("at least some multi-line bundles from 69% repetition", multi.length > 0, multi.length);

  console.log(`\n组合测试: ${pass} 通过, ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
