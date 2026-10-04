import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { aggregateOrderRequirements } from "@/lib/stock-consume";
import { MaterialDemandTable } from "./demand-table";

export const dynamic = "force-dynamic";

/**
 * P1-B2: 原料需求汇总（mini-MRP）。
 * 需求 = 在产/待开工/外协中工单的用料（与扣料完全同口径）；
 * 现存 = 车间库存；在途 = 未取消 PO 未收货行。
 * 净缺口 > 0 一键生成采购草稿（复用现有 PO API）。
 */
export default async function MaterialDemandPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  const [workOrders, inventories, poLines, products, suppliers, workshops] = await Promise.all([
    prisma.workOrder.findMany({
      where: { status: { in: ["PENDING_START", "PROCESSING", "OUTSOURCING"] } },
      select: { orderNo: true, workshopId: true, workOrderNo: true },
    }),
    prisma.workshopInventory.findMany({ select: { workshopId: true, sku: true, quantity: true } }),
    prisma.purchaseOrderLine.findMany({
      where: { po: { status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] } } },
      select: { sku: true, quantity: true, receivedQty: true, po: { select: { workshopId: true } } },
    }),
    prisma.product.findMany({ where: { category: "PROFILE", isActive: true }, select: { id: true, sku: true, productName: true, spec: true, purchasePrice: true } }),
    prisma.supplier.findMany({ where: { isActive: true, category: "RAW_MATERIAL" }, select: { id: true, supplierNo: true, name: true } }),
    prisma.workshop.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true } }),
  ]);

  // 需求聚合（与 consumeWorkOrderMaterials 同口径棒数折算）
  const demand = new Map<string, { sku: string; productName: string; qty: number }>();
  for (const wo of workOrders) {
    const reqs = await aggregateOrderRequirements(prisma, wo.orderNo);
    for (const [sku, item] of reqs.entries()) {
      const existing = demand.get(sku) ?? { sku, productName: item.productName, qty: 0 };
      existing.qty += item.quantity;
      demand.set(sku, existing);
    }
  }
  const stockBySku = new Map<string, number>();
  for (const inv of inventories) stockBySku.set(inv.sku, (stockBySku.get(inv.sku) ?? 0) + inv.quantity);
  const transitBySku = new Map<string, number>();
  for (const l of poLines) transitBySku.set(l.sku, (transitBySku.get(l.sku) ?? 0) + Math.max(0, l.quantity - l.receivedQty));

  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const rows = [...demand.values()]
    .map((d) => {
      const stock = stockBySku.get(d.sku) ?? 0;
      const transit = transitBySku.get(d.sku) ?? 0;
      const product = productBySku.get(d.sku);
      return {
        sku: d.sku,
        productName: product?.productName ?? d.productName,
        spec: product?.spec ?? null,
        unitPrice: product ? Number(product.purchasePrice ?? 0) : 0,
        demand: d.qty,
        stock,
        transit,
        gap: Math.max(0, d.qty - stock - transit),
      };
    })
    .sort((a, b) => b.gap - a.gap || b.demand - a.demand);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">原料需求汇总</h1>
        <p className="text-sm text-muted-foreground">
          在产/待开工/外协中工单的用料需求 vs 车间现存 vs 在途采购（未收货）。净缺口可一键生成采购草稿。
          共 {workOrders.length} 张在制工单参与统计。
        </p>
      </div>
      <MaterialDemandTable
        rows={rows}
        suppliers={suppliers}
        workshops={workshops}
        anyWorkshop={workshops[0]?.id ?? ""}
      />
    </div>
  );
}
