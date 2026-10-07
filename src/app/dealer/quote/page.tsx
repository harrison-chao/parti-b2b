import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings";
import { LEVEL_DISCOUNT } from "@/lib/pricing";
import { QuoteWorkbench } from "./workbench";

export default async function QuotePage({ searchParams }: { searchParams: { from?: string; mode?: string } }) {
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

  // 载入历史单：from=单号；mode=edit 时为"继续编辑草稿"（更新原单），否则为"再来一单"（提交生成新单）
  let initial: any = null;
  if (searchParams.from) {
    const src = await prisma.salesOrder.findFirst({
      where: { orderNo: searchParams.from, dealerId: dealer!.id },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
    if (src) {
      const editable = src.orderStatus === "DRAFT" || src.orderStatus === "MODIFYING";
      initial = {
        orderNo: src.orderNo,
        editMode: searchParams.mode === "edit" && editable,
        targetDeliveryDate: src.targetDeliveryDate.toISOString().slice(0, 10),
        receiverName: src.receiverName,
        receiverPhone: src.receiverPhone,
        receiverAddress: src.receiverAddress,
        remark: src.remark ?? "",
        lines: src.lines.map((l) => ({
          lineType: l.lineType,
          rawProductId: l.rawProductId ?? undefined,
          productId: l.productId ?? undefined,
          productName: l.productName ?? "",
          spec: l.spec ?? "",
          quantity: l.quantity,
          cutLengthMm: l.cutLengthMm ?? l.lengthMm ?? undefined,
          surfaceProcessCode: l.surfaceProcessCode ?? undefined,
          surfaceColorCode: l.surfaceColorCode ?? undefined,
          processCodes: (l.processCodes ?? []).filter((c: string) => c !== "L"),
          targetPrice: l.targetPrice != null ? Number(l.targetPrice) : undefined,
          purchasePrice: l.lineType === "OUTSOURCED" ? Number(l.unitPrice) : undefined,
          targetPriceText: l.lineType === "OUTSOURCED" && l.targetPrice != null ? String(Number(l.targetPrice)) : "",
          drawingUrl: l.drawingUrl ?? "",
          drawingFileName: l.drawingFileName ?? "",
        })),
      };
    }
  }

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
        label: (a as any).label ?? null,
        addressType: (a as any).addressType ?? null,
      }))}
      initial={initial}
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
        surfaceProcessCode: (p as any).surfaceProcessCode ?? null,
        surfaceColorCode: (p as any).surfaceColorCode ?? null,
        materialStage: (p as any).materialStage ?? null,
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
