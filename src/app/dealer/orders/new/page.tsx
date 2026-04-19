import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LEVEL_DISCOUNT } from "@/lib/pricing";
import { NewOrderForm } from "./form";

export default async function NewOrderPage() {
  const session = await auth();
  const dealer = await prisma.dealer.findUnique({
    where: { id: session!.user.dealerId! },
    include: { addresses: { orderBy: [{ isDefault: "desc" }] } },
  });
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ series: "asc" }, { lengthInch: "asc" }],
  });

  const level = dealer!.priceLevel;
  const discount = LEVEL_DISCOUNT[level];
  const productsWithPrice = products.map((p) => ({
    sku: p.sku,
    productName: p.productName,
    series: p.series,
    lengthMm: Number(p.lengthMm),
    lengthInch: Number(p.lengthInch),
    retailPrice: Number(p.retailPrice),
    dealerPrice: Math.round(Number(p.retailPrice) * discount * 100) / 100,
  }));

  return (
    <NewOrderForm
      dealer={{
        id: dealer!.id,
        companyName: dealer!.companyName,
        priceLevel: level,
        paymentMethod: dealer!.paymentMethod,
        creditBalance: Number(dealer!.creditBalance),
      }}
      addresses={dealer!.addresses.map((a) => ({
        id: a.id,
        receiverName: a.receiverName,
        receiverPhone: a.receiverPhone,
        fullAddress: `${a.province}${a.city}${a.district}${a.detailAddress}`,
        isDefault: a.isDefault,
      }))}
      products={productsWithPrice}
    />
  );
}
