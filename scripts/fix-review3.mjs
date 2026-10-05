/**
 * 第三轮审查数据修复（幂等，可在本地/生产重复执行）：
 *  1) 在制（未发货完）订单行：停用原料 RAW-P2525/RAW-P5050 → 按行表面码选对应新 SKU（缺码回退银色硬氧 3.6m）
 *  2) OrderCombo：行重映射同规则 + 重算 signature（combo.ts 口径）；新签名撞车则删除该组合
 *  3) 报告：遮蔽 bug 窗口（2026-10-05 10:00 后）创建的 0 行订单清单（不自动改，人工补录）
 * 运行：node scripts/fix-review3.mjs（DATABASE_URL 指向目标库）
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SUCCESSOR_DEFAULT = "RAW-MR2525-9-3600-A-SV";

const comboLineSignature = (l) =>
  [l.lineType, l.sku, l.cutLengthMm ?? "", [...(l.processCodes ?? [])].sort().join("+"), l.surfaceProcessCode ?? "", l.surfaceColorCode ?? ""].join("|");
const comboSignature = (lines) => lines.map(comboLineSignature).sort().join(";;");

async function main() {
  const oldRaws = await prisma.product.findMany({
    where: { sku: { in: ["RAW-P2525", "RAW-P2550", "RAW-P5050", "RAW-P7575"] } },
    select: { id: true, sku: true },
  });
  const oldIds = new Map(oldRaws.map((p) => [p.id, p.sku]));
  if (!oldIds.size) { console.log("无旧原料记录，跳过"); return; }

  // 新 SKU 目录：按 (系列标准化, 棒长, 工艺, 颜色) 索引
  const newRaws = await prisma.product.findMany({
    where: { isRawMaterial: true, isActive: true, sku: { startsWith: "RAW-" }, materialStage: "RAW" },
  });
  const def = newRaws.find((r) => r.sku === SUCCESSOR_DEFAULT);
  const pickSuccessor = (line) => {
    const proc = line.surfaceProcessCode ?? null;
    const color = line.surfaceColorCode ?? null;
    if (!proc && !color) return def ?? null;
    // 优先完全匹配（系列 MR2525* + 码 + 任意棒长，偏好库存最多的），再只匹配码
    const cands = newRaws.filter((r) => r.surfaceProcessCode === proc && (color == null || r.surfaceColorCode === color) && /MR2525/i.test(r.series));
    if (cands.length) return cands.sort((a, b) => b.lengthMm - a.lengthMm)[0];
    const byCodes = newRaws.filter((r) => r.surfaceProcessCode === proc && (color == null || r.surfaceColorCode === color));
    return byCodes[0] ?? def ?? null;
  };

  // 1) 在制订单行重指
  console.log("== 在制订单行重指 ==");
  const openOrders = await prisma.salesOrder.findMany({
    where: { orderStatus: { in: ["CONFIRMED", "PARTIALLY_PAID", "PRODUCING", "READY"] } },
    select: { orderNo: true, lines: { where: { rawProductId: { in: [...oldIds.keys()] } } } },
  });
  let lineCount = 0;
  for (const o of openOrders) {
    for (const l of o.lines) {
      const succ = pickSuccessor(l);
      if (!succ) { console.log(`⚠ ${o.orderNo} 行${l.lineNo} 无后继可用`); continue; }
      await prisma.salesOrderLine.update({
        where: { id: l.id },
        data: {
          rawProductId: succ.id, sku: succ.sku,
          surfaceProcessCode: l.surfaceProcessCode ?? succ.surfaceProcessCode,
          surfaceColorCode: l.surfaceColorCode ?? succ.surfaceColorCode,
        },
      });
      lineCount++;
      console.log(`${o.orderNo} 行${l.lineNo}: ${oldIds.get(l.rawProductId)} → ${succ.sku}`);
    }
  }
  console.log(`共重指 ${lineCount} 行`);

  // 2) 组合重映射 v2（含 signature 重算）
  console.log("== 组合重映射 v2 ==");
  const combos = await prisma.orderCombo.findMany();
  let remapped = 0, deleted = 0;
  for (const c of combos) {
    const lines = c.lines;
    if (!Array.isArray(lines) || !lines.some((l) => l?.rawProductId && oldIds.has(l.rawProductId))) continue;
    const newLines = lines.map((l) => {
      if (!l?.rawProductId || !oldIds.has(l.rawProductId)) return l;
      const succ = pickSuccessor(l) ?? def;
      if (!succ) return l;
      return { ...l, rawProductId: succ.id, sku: succ.sku, surfaceProcessCode: l.surfaceProcessCode ?? succ.surfaceProcessCode, surfaceColorCode: l.surfaceColorCode ?? succ.surfaceColorCode };
    });
    const sig = comboSignature(newLines);
    const clash = await prisma.orderCombo.findFirst({ where: { signature: sig, id: { not: c.id } } });
    if (clash) {
      await prisma.orderCombo.delete({ where: { id: c.id } });
      deleted++;
      console.log(`${c.name}: 新签名与「${clash.name}」重复，删除旧组合`);
      continue;
    }
    await prisma.orderCombo.update({ where: { id: c.id }, data: { lines: newLines, signature: sig } });
    remapped++;
  }
  console.log(`重映射 ${remapped} 个、去重删除 ${deleted} 个`);

  // 3) 遮蔽 bug 窗口 0 行订单报告
  console.log("== 遮蔽 bug 窗口（2026-10-05 10:00+）订单 ==");
  const since = new Date("2026-10-05T02:00:00.000Z");
  const recent = await prisma.salesOrder.findMany({
    where: { createdAt: { gte: since } },
    select: { orderNo: true, orderStatus: true, createdVia: true, totalAmount: true, createdAt: true, _count: { select: { lines: true } } },
    orderBy: { createdAt: "asc" },
  });
  for (const o of recent) {
    console.log(`${o.orderNo} ${o.orderStatus} ${o.createdVia} ¥${Number(o.totalAmount)} 行数=${o._count.lines} ${o.createdAt.toISOString()}`);
  }
  if (!recent.length) console.log("（窗口内无订单）");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
