import { prisma } from "@/lib/prisma";
import { DealersManager } from "./manager";

export default async function AdminDealersPage({ searchParams }: { searchParams: { tab?: string } }) {
  const dealers = await prisma.dealer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      _count: { select: { salesOrders: true } },
    },
  });
  const plain = dealers.map((d) => ({
    id: d.id,
    dealerNo: d.dealerNo,
    companyName: d.companyName,
    customerType: d.customerType,
    nickname: d.nickname,
    enforcePrepay: d.enforcePrepay,
    contactName: d.contactName,
    contactPhone: d.contactPhone,
    legalName: d.legalName,
    taxNo: d.taxNo,
    invoiceTitle: d.invoiceTitle,
    invoiceType: d.invoiceType,
    bankName: d.bankName,
    bankAccount: d.bankAccount,
    region: d.region,
    industry: d.industry,
    source: d.source,
    salesOwner: d.salesOwner,
    creditDays: d.creditDays,
    allowOverCredit: d.allowOverCredit,
    remark: d.remark,
    priceLevel: d.priceLevel,
    creditLimit: Number(d.creditLimit),
    creditBalance: Number(d.creditBalance),
    paymentMethod: d.paymentMethod,
    status: d.status,
    contacts: d.contacts,
    orderCount: d._count.salesOrders,
    createdAt: d.createdAt.toISOString(),
  }));
  return <DealersManager initial={plain} initialTab={searchParams.tab === "WALK_IN" || searchParams.tab === "ALL" ? searchParams.tab : "DEALER"} />;
}
