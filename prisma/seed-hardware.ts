import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Parti 标准零配件 HARDWARE SKUs. Idempotent: upserts by sku.
// Prices are placeholders — admin adjusts in 产品目录 UI.
const HARDWARE = [
  { sku: "OL2525",    productName: "六通 OL2525",       series: "六通", retailPrice: 45,  drawingRequired: false, spec: "25x25" },
  { sku: "OL2550",    productName: "六通 OL2550",       series: "六通", retailPrice: 55,  drawingRequired: false, spec: "25x50" },
  { sku: "OL5050/C",  productName: "六通 OL5050/C",     series: "六通", retailPrice: 78,  drawingRequired: false, spec: "50x50 / C 型" },
  { sku: "OL5050/C²", productName: "六通 OL5050/C²",    series: "六通", retailPrice: 88,  drawingRequired: false, spec: "50x50 / C² 型" },
  { sku: "OL2032",    productName: "六通 OL2032",       series: "六通", retailPrice: 48,  drawingRequired: false, spec: "20x32" },
  { sku: "OL7575/X",  productName: "六通 OL7575/X",     series: "六通", retailPrice: 120, drawingRequired: false, spec: "75x75 / X 型" },
  { sku: "OL7575/X²", productName: "六通 OL7575/X²",    series: "六通", retailPrice: 135, drawingRequired: false, spec: "75x75 / X² 型" },
  { sku: "OL-CUSTOM", productName: "定制六通（需上传图纸）", series: "六通", retailPrice: 200, drawingRequired: true,  spec: "按图纸" },
  { sku: "LY15-MR2525", productName: "层板托 LY15-MR2525", series: "层板托", retailPrice: 18, drawingRequired: false, spec: "MR2525 用" },
];

async function main() {
  console.log("🌱 Seeding HARDWARE products...");
  for (const h of HARDWARE) {
    await prisma.product.upsert({
      where: { sku: h.sku },
      update: {
        productName: h.productName,
        series: h.series,
        category: "HARDWARE",
        retailPrice: h.retailPrice,
        drawingRequired: h.drawingRequired,
        spec: h.spec,
        isCustom: false,
        isActive: true,
      },
      create: {
        sku: h.sku,
        productName: h.productName,
        series: h.series,
        category: "HARDWARE",
        retailPrice: h.retailPrice,
        drawingRequired: h.drawingRequired,
        spec: h.spec,
        isCustom: false,
        isActive: true,
      },
    });
  }
  console.log(`✓ ${HARDWARE.length} HARDWARE SKUs synced`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
