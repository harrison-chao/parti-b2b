import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CheckoutForm } from "./form";

export default async function NewOrderPage() {
  const session = await auth();
  const dealer = await prisma.dealer.findUnique({
    where: { id: session!.user.dealerId! },
    include: { addresses: { orderBy: [{ isDefault: "desc" }] } },
  });

  return (
    <CheckoutForm
      dealer={{
        id: dealer!.id,
        companyName: dealer!.companyName,
        priceLevel: dealer!.priceLevel,
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
    />
  );
}
