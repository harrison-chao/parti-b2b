import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calcPricing, STANDARD_SPECS_MR2525 } from "../src/lib/pricing";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding...");

  await prisma.salesOrderLine.deleteMany();
  await prisma.salesOrder.deleteMany();
  await prisma.dealerAddress.deleteMany();
  await prisma.user.deleteMany();
  await prisma.dealer.deleteMany();
  await prisma.product.deleteMany();

  const adminPwd = await bcrypt.hash("admin123", 10);
  const opsPwd = await bcrypt.hash("ops123", 10);
  const dealerPwd = await bcrypt.hash("dealer123", 10);

  await prisma.user.create({
    data: { email: "admin@parti.com", name: "系统管理员", password: adminPwd, role: "ADMIN" },
  });
  await prisma.user.create({
    data: { email: "ops@parti.com", name: "运营小李", password: opsPwd, role: "OPS" },
  });

  const dealer = await prisma.dealer.create({
    data: {
      dealerNo: "PARTI-D-0001",
      companyName: "上海示例经销有限公司",
      contactName: "张经理",
      contactPhone: "13800000001",
      priceLevel: "C",
      creditLimit: 100000,
      creditBalance: 100000,
      usedCredit: 0,
      paymentMethod: "CREDIT",
      status: "ACTIVE",
    },
  });

  await prisma.user.create({
    data: {
      email: "dealer@parti.com",
      name: "张经理",
      password: dealerPwd,
      role: "DEALER",
      dealerId: dealer.id,
    },
  });

  await prisma.dealerAddress.create({
    data: {
      dealerId: dealer.id,
      addressType: "warehouse",
      receiverName: "张经理",
      receiverPhone: "13800000001",
      province: "上海市",
      city: "上海市",
      district: "浦东新区",
      detailAddress: "张江高科技园区科苑路 88 号 12 幢",
      isDefault: true,
    },
  });

  for (const spec of STANDARD_SPECS_MR2525) {
    const p = calcPricing(spec.mm, "A");
    const sku = `C-MR-2525-${spec.inch}-A-SV`;
    await prisma.product.create({
      data: {
        sku,
        productName: `MR2525 商用线槽 ${spec.inch}英寸 银色阳极氧化`,
        series: "MR2525",
        lengthInch: spec.inch,
        lengthMm: spec.mm,
        isCustom: false,
        retailPrice: p.retailPrice,
        unit: "根",
        isActive: true,
      },
    });
  }

  console.log("✅ Seed complete");
  console.log("   Admin:  admin@parti.com / admin123");
  console.log("   Ops:    ops@parti.com / ops123");
  console.log("   Dealer: dealer@parti.com / dealer123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
