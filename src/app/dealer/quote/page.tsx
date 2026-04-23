import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings";
import { LEVEL_DISCOUNT } from "@/lib/pricing";
import { QuoteWorkbench } from "./workbench";

export default async function QuotePage() {
  const session = await auth();
  const dealer = await prisma.dealer.findUnique({
    where: { id: session!.user.dealerId! },
    include: { addresses: { orderBy: [{ isDefault: "desc" }] } },
  });
  const settings = await loadSettings();
  const hardware = await prisma.product.findMany({
    where: { category: "HARDWARE", isActive: true },
    orderBy: [{ series: "asc" }, { sku: "asc" }],
  });
  const rawProfiles = await prisma.product.findMany({
    where: { category: "PROFILE", isRawMaterial: true, isActive: true },
    orderBy: [{ series: "asc" }, { sku: "asc" }],
  });
  const crmCustomers = await prisma.crmCustomer.findMany({
    where: { dealerId: dealer!.id, stage: { not: "LOST" } },
    orderBy: [{ nextFollowAt: "asc" }, { updatedAt: "desc" }],
    include: { opportunities: { where: { stage: { notIn: ["WON", "LOST"] } }, orderBy: { updatedAt: "desc" } } },
  });
  const discount = LEVEL_DISCOUNT[dealer!.priceLevel];

  return (
    <QuoteWorkbench
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
      options={{
        surfaceProcesses: settings.surfaceProcesses,
        surfaceColors: settings.surfaceColors,
        processingOperations: settings.processingOperations,
      }}
      hardwareCatalog={hardware.map((p) => ({
        id: p.id,
        sku: p.sku,
        productName: p.productName,
        series: p.series,
        spec: p.spec,
        retailPrice: Number(p.retailPrice),
        dealerPrice: Math.round(Number(p.retailPrice) * discount * 100) / 100,
        drawingRequired: p.drawingRequired,
      }))}
      rawProfileCatalog={rawProfiles.map((p) => ({
        id: p.id,
        sku: p.sku,
        productName: p.productName,
        series: p.series,
        spec: p.spec,
        lengthMm: p.lengthMm ? Number(p.lengthMm) : null,
      }))}
      crmCustomers={crmCustomers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        stage: customer.stage,
        opportunities: customer.opportunities.map((opportunity) => ({
          id: opportunity.id,
          title: opportunity.title,
          stage: opportunity.stage,
        })),
      }))}
    />
  );
}
