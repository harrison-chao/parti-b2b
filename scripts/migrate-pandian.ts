/**
 * 第 3 步迁移：原料 SKU 表面化 + 盘点初始化（2026-09-26 顺德仓日盘，飞书「边缘制造加工任务单/顺德仓日盘」）
 *
 * 幂等：以「盘点初始化 2026-09-26」流水为准，已入仓的 SKU 跳过；产品按 SKU upsert。
 * 步骤：
 *   1) 建/补 13 个表面化原料 SKU（系列×棒长×表面×颜色）并按盘点数量入仓（MANUAL_ADJUST）
 *   2) 五金：按现有 SKU 归集入仓（六通六色合并入单 SKU，明细记流水备注）；缺的（滚花梢/连接件/蝶形螺母）自动建档
 *   3) 旧裸原料（RAW-P2525/2550/5050/7575）停用（不删，保历史引用）
 *   4) OrderCombo 中旧 RAW-P2525 引用重映射到 RAW-MR2525-9-3600-A-SV（银色硬氧 276 根，直接后继）
 *   5) SalesOrderLine 双码 backfill（从旧 surfaceTreatment 解析，原串保留）
 * 运行：npx tsx scripts/migrate-pandian.ts（DATABASE_URL 指向目标库）
 */
import { PrismaClient } from "@prisma/client";
import { applyStockMovement } from "../src/lib/inventory";
import { surfaceCodesOf } from "../src/lib/surface";

const prisma = new PrismaClient();
const NOTE = "盘点初始化 2026-09-26（顺德仓日盘）";

// 盘点数据（9.26 列；系列=型号原文；棒长从名称解析；颜色按词典映射）
const PROFILE_ROWS: Array<{ series: string; barMm: number; proc: string | null; color: string | null; qty: number; raw: string }> = [
  { series: "MR2525/9", barMm: 4000, proc: "A", color: "OB", qty: 21, raw: "Black曜石黑-氧化" },
  { series: "MR2525/9", barMm: 6000, proc: "W", color: "IB", qty: 67, raw: "Blue 冰川蓝-水漆" },
  { series: "MR2525/9", barMm: 4000, proc: "A", color: "NB", qty: 50, raw: "Darkblue午夜蓝-氧化" },
  { series: "MR2525/9", barMm: 4000, proc: "A", color: "AG", qty: 20, raw: "Gold 古铜金-氧化" },
  { series: "MR2525/9", barMm: 4000, proc: "A", color: "RG", qty: 29, raw: "Gold玫瑰金-氧化" },
  { series: "MR2525/9", barMm: 4000, proc: "A", color: "GY", qty: 22, raw: "Grey太空灰色-氧化" },
  { series: "MR2525/9", barMm: 4000, proc: "A", color: "OR", qty: 34, raw: "Orange活力橙-氧化" },
  { series: "MR2525/9", barMm: 3600, proc: "A", color: "SV", qty: 276, raw: "Silver太空银-氧化" },
  { series: "MR2525/9", barMm: 6000, proc: "W", color: "PW", qty: 2, raw: "White 珍珠白-水漆" },
  { series: "MR2525/9", barMm: 4000, proc: "T", color: "WO", qty: 259, raw: "热转印白橡木纹" },
  { series: "MR2525/8", barMm: 6000, proc: "A", color: "GY", qty: 10, raw: "Grey太空灰色-氧化" },
  { series: "R2525", barMm: 4000, proc: "A", color: "AG", qty: 13, raw: "Gold 古铜金-氧化" },
  { series: "LY15-MR2525", barMm: 6000, proc: "NP", color: null, qty: 0, raw: "胚料本色" },
];

const sanitize = (s: string) => (s ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const skuOf = (r: { series: string; barMm: number; proc: string | null; color: string | null }) =>
  ["RAW", sanitize(r.series), String(r.barMm), r.proc, r.color].filter(Boolean).join("-");

// 五金归集：目标 SKU（现有档案） ← 各颜色数量（明细记备注）
const HW_ROWS: Array<{ sku: string; productName: string; series: string; spec: string | null; qty: number; detail: string }> = [
  { sku: "OL2525", productName: "六通 OL2525", series: "六通", spec: "OL2525", qty: 26069, detail: "银12808/灰6855/黑4719/古铜金303/定制黄金1011/镀铬373" },
  { sku: "OL2032", productName: "六通 OL2032", series: "六通", spec: "OL2032", qty: 45, detail: "银45" },
  { sku: "OL2550", productName: "六通 OL2550", series: "六通", spec: "OL2550", qty: 0, detail: "银0" },
  { sku: "OL5050/C", productName: "六通 OL5050/C", series: "六通", spec: "OL5050/C", qty: 18, detail: "银18" },
  { sku: "OL5050/C²", productName: "六通 OL5050/C²", series: "六通", spec: "OL5050/C²", qty: 153, detail: "银153" },
  { sku: "OL7575/X", productName: "六通 OL7575/X", series: "六通", spec: "OL7575/X", qty: 29, detail: "银29" },
  { sku: "OL7575/X²", productName: "六通 OL7575/X²", series: "六通", spec: "OL7575/X²", qty: 0, detail: "银0" },
  { sku: "LY15-MR2525", productName: "层板托 LY15-MR2525", series: "层板托", spec: "LY15-MR2525", qty: 100, detail: "4寸本色100" },
];

// 需要时新建的五金（按名称找不到才建，SKU 自动 HW-年月-序号）
const HW_CREATE_IF_MISSING: Array<{ matchName: string; productName: string; series: string; spec: string | null; qty: number; detail: string }> = [
  { matchName: "滚花梢 5*18", productName: "滚花梢 5*18", series: "滚花梢", spec: "5*18", qty: 7000, detail: "本色7000" },
  { matchName: "滚花梢 5*22", productName: "滚花梢 5*22", series: "滚花梢", spec: "5*22", qty: 150, detail: "本色150" },
  { matchName: "连接件", productName: "连接件", series: "连接件", spec: null, qty: 1264, detail: "本色1264" },
  { matchName: "蝶形螺母", productName: "蝶形螺母", series: "蝶形螺母", spec: null, qty: 0, detail: "0" },
];

const OLD_RAW_SKUS = ["RAW-P2525", "RAW-P2550", "RAW-P5050", "RAW-P7575"];
const SUCCESSOR_SKU = "RAW-MR2525-9-3600-A-SV";

async function main() {
  const workshop = (await prisma.workshop.findFirst({ where: { isActive: true }, orderBy: { code: "asc" } }))!;
  console.log(`目标车间：${workshop.name} (${workshop.id})`);

  // 已入仓标记（幂等）
  const done = new Set(
    (await prisma.stockMovement.findMany({
      where: { type: "MANUAL_ADJUST", note: { contains: "盘点初始化 2026-09-26" } },
      select: { sku: true },
    })).map((m) => m.sku),
  );
  const oldP2525 = await prisma.product.findUnique({ where: { sku: "RAW-P2525" } });
  const refWeight = oldP2525?.weightPerMeter ?? null;

  const stock = async (sku: string, productName: string, qty: number, detail: string) => {
    if (qty <= 0 || done.has(sku)) return done.has(sku) ? "已入仓跳过" : "qty0";
    await applyStockMovement(prisma, {
      workshopId: workshop.id, sku, productName, delta: qty, type: "MANUAL_ADJUST",
      note: `${NOTE} · ${detail}`, allowNegative: true,
    });
    return `+${qty}`;
  };

  // 1) 原料型材
  console.log("\n== 原料型材 ==");
  for (const r of PROFILE_ROWS) {
    const sku = skuOf(r);
    const product = await prisma.product.upsert({
      where: { sku },
      create: {
        sku, productName: r.series, series: r.series, category: "PROFILE",
        retailPrice: 0, unit: "根", isRawMaterial: true, materialStage: "RAW",
        lengthMm: r.barMm, weightPerMeter: refWeight, yieldRate: 0.95,
        surfaceProcessCode: r.proc, surfaceColorCode: r.color, isActive: true,
      },
      update: { isRawMaterial: true, materialStage: "RAW", lengthMm: r.barMm, surfaceProcessCode: r.proc, surfaceColorCode: r.color, isActive: true },
    });
    console.log(`${sku} ← ${r.raw}：${await stock(sku, product.productName, r.qty, r.raw)}`);
  }

  // 2) 五金
  console.log("\n== 五金 ==");
  for (const r of HW_ROWS) {
    const product = await prisma.product.upsert({
      where: { sku: r.sku },
      create: { sku: r.sku, productName: r.productName, series: r.series, category: "HARDWARE", spec: r.spec, retailPrice: 0, unit: "件", isActive: true },
      update: { isActive: true },
    });
    console.log(`${r.sku}：${await stock(r.sku, product.productName, r.qty, r.detail)}`);
  }
  for (const r of HW_CREATE_IF_MISSING) {
    let product = await prisma.product.findFirst({ where: { productName: r.matchName, category: "HARDWARE" }, orderBy: { isActive: "desc" } });
    if (!product) {
      const n = (await prisma.product.count({ where: { sku: { startsWith: `HW-${yymm()}-` } } })) + 1;
      const sku = `HW-${yymm()}-${String(n).padStart(3, "0")}`;
      product = await prisma.product.create({
        data: { sku, productName: r.productName, series: r.series, category: "HARDWARE", spec: r.spec, retailPrice: 0, unit: "件", isActive: true },
      });
      console.log(`新建 ${sku}（${r.productName}）`);
    }
    console.log(`${product.sku}：${await stock(product.sku, product.productName, r.qty, r.detail)}`);
  }

  // 3) 旧裸原料停用
  console.log("\n== 停用旧裸原料 ==");
  for (const sku of OLD_RAW_SKUS) {
    const p = await prisma.product.findUnique({ where: { sku } });
    if (!p) { console.log(`${sku}：不存在跳过`); continue; }
    if (p.isActive) await prisma.product.update({ where: { id: p.id }, data: { isActive: false } });
    console.log(`${sku}：已停用`);
  }

  // 4) 组合重映射
  console.log("\n== 组合重映射 ==");
  const successor = await prisma.product.findUnique({ where: { sku: SUCCESSOR_SKU } });
  if (oldP2525 && successor) {
    const combos = await prisma.orderCombo.findMany({ where: {} });
    let remapped = 0;
    for (const c of combos) {
      const lines = c.lines as any[];
      if (!Array.isArray(lines) || !lines.some((l) => l?.rawProductId === oldP2525.id)) continue;
      const newLines = lines.map((l) =>
        l?.rawProductId === oldP2525.id
          ? { ...l, rawProductId: successor.id, sku: successor.sku, surfaceProcessCode: l.surfaceProcessCode ?? "A", surfaceColorCode: l.surfaceColorCode ?? "SV" }
          : l,
      );
      await prisma.orderCombo.update({ where: { id: c.id }, data: { lines: newLines } });
      remapped++;
    }
    console.log(`RAW-P2525 → ${SUCCESSOR_SKU}：重映射 ${remapped} 个组合`);
  } else {
    console.log(`前置缺失（旧=${!!oldP2525} 后继=${!!successor}），跳过重映射`);
  }

  // 5) 订单行双码 backfill
  console.log("\n== 订单行双码 backfill ==");
  const lines = await prisma.salesOrderLine.findMany({
    where: { surfaceProcessCode: null, surfaceColorCode: null, surfaceTreatment: { not: null } },
    select: { id: true, surfaceTreatment: true },
  });
  let backfilled = 0;
  for (const l of lines) {
    const codes = surfaceCodesOf({ surfaceTreatment: l.surfaceTreatment ?? undefined });
    if (codes.processCode || codes.colorCode) {
      await prisma.salesOrderLine.update({
        where: { id: l.id },
        data: { surfaceProcessCode: codes.processCode, surfaceColorCode: codes.colorCode },
      });
      backfilled++;
    }
  }
  console.log(`解析回填 ${backfilled}/${lines.length} 行（其余为无法解析的自由文本，原串保留）`);

  // 汇总
  const inv = await prisma.workshopInventory.findMany({ where: { workshopId: workshop.id }, orderBy: { sku: "asc" } });
  console.log(`\n== ${workshop.name} 库存现状（${inv.length} 行）==`);
  for (const i of inv) console.log(`${i.sku.padEnd(28)} ${String(i.quantity).padStart(6)}  avg=${i.avgCostPerMeter ?? "-"}`);
}

const yymm = () => `${String(new Date().getFullYear()).slice(2)}${String(new Date().getMonth() + 1).padStart(2, "0")}`;

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
