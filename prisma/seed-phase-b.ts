import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Phase B seed: suppliers + raw-material PROFILE SKUs (3.6m bars).
// Idempotent.

const SUPPLIERS = [
  { supplierNo: "SUP-001", name: "宁波铝材厂", contactName: "王厂长", contactPhone: "13900000001", address: "浙江宁波" },
  { supplierNo: "SUP-002", name: "广东五金批发", contactName: "李经理", contactPhone: "13900000002", address: "广东佛山" },
];

// Raw profile bars (3.6m). isRawMaterial = true; these are what enters inventory.
const RAW_PROFILES = [
  { sku: "RAW-P2525",  productName: "原料 型材 25x25 3.6m", series: "原料", spec: "25x25", lengthMm: 3600, purchasePrice: 48 },
  { sku: "RAW-P2550",  productName: "原料 型材 25x50 3.6m", series: "原料", spec: "25x50", lengthMm: 3600, purchasePrice: 72 },
  { sku: "RAW-P5050",  productName: "原料 型材 50x50 3.6m", series: "原料", spec: "50x50", lengthMm: 3600, purchasePrice: 120 },
  { sku: "RAW-P7575",  productName: "原料 型材 75x75 3.6m", series: "原料", spec: "75x75", lengthMm: 3600, purchasePrice: 190 },
];

async function main() {
  console.log("🌱 Seeding suppliers...");
  for (const s of SUPPLIERS) {
    await prisma.supplier.upsert({
      where: { supplierNo: s.supplierNo },
      update: { name: s.name, contactName: s.contactName, contactPhone: s.contactPhone, address: s.address, isActive: true },
      create: s,
    });
    console.log(`  ✓ ${s.supplierNo} ${s.name}`);
  }

  console.log("🌱 Seeding raw profile SKUs...");
  for (const p of RAW_PROFILES) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        productName: p.productName,
        series: p.series,
        category: "PROFILE",
        spec: p.spec,
        lengthMm: p.lengthMm,
        purchasePrice: p.purchasePrice,
        retailPrice: p.purchasePrice, // raw材不零售, placeholder
        isRawMaterial: true,
        isActive: true,
      },
      create: {
        sku: p.sku,
        productName: p.productName,
        series: p.series,
        category: "PROFILE",
        spec: p.spec,
        lengthMm: p.lengthMm,
        purchasePrice: p.purchasePrice,
        retailPrice: p.purchasePrice,
        isRawMaterial: true,
        isActive: true,
      },
    });
    console.log(`  ✓ ${p.sku}`);
  }

  console.log("✅ Phase B seed done");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
