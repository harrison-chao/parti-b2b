import { prisma } from "@/lib/prisma";
import { DealersManager } from "./manager";

export default async function AdminDealersPage() {
  const dealers = await prisma.dealer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { salesOrders: true } } },
  });
  const plain = dealers.map((d) => ({
    id: d.id,
    dealerNo: d.dealerNo,
    companyName: d.companyName,
    contactName: d.contactName,
    contactPhone: d.contactPhone,
    priceLevel: d.priceLevel,
    creditLimit: Number(d.creditLimit),
    creditBalance: Number(d.creditBalance),
    paymentMethod: d.paymentMethod,
    status: d.status,
    orderCount: d._count.salesOrders,
    createdAt: d.createdAt.toISOString(),
  }));
  return <DealersManager initial={plain} />;
}
