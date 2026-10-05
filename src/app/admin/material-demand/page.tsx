import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getReorderSuggestions, allocationsByStatuses } from "@/lib/inventory-analytics";
import { formatMoney } from "@/lib/utils";
import { MaterialDemandTable } from "./demand-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const DEMAND_STATUSES = ["PENDING_START", "PROCESSING", "OUTSOURCING"] as const;
  const [inventories, poLines, products, suppliers, workshops, reorder, demandAlloc] = await Promise.all([
    prisma.workshopInventory.findMany({ select: { workshopId: true, sku: true, quantity: true } }),
    prisma.purchaseOrderLine.findMany({
      where: { po: { status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] } } },
      select: { sku: true, quantity: true, receivedQty: true, po: { select: { workshopId: true } } },
    }),
    prisma.product.findMany({ where: { category: "PROFILE", isActive: true }, select: { id: true, sku: true, productName: true, spec: true, weightPerMeter: true, purchasePrice: true } }),
    prisma.supplier.findMany({ where: { isActive: true, category: "RAW_MATERIAL" }, select: { id: true, supplierNo: true, name: true } }),
    prisma.workshop.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true } }),
    getReorderSuggestions(prisma),
    allocationsByStatuses(prisma, DEMAND_STATUSES),
  ]);
  const outsourced = demandAlloc.allocations.outsourced;
  const workOrders = [...new Set(outsourced.map((o) => o.orderNo))].map((orderNo) => ({ orderNo })); // 计数用

  // 需求按「车间×SKU」聚合（与派单/开工的缺料检查同口径：A 有货 B 缺料不能互相抵扣）
  // 复用 allocationsByStatuses 的批量结果（byWsSku），不再逐单 N+1 查询
  const demand = new Map<string, { workshopId: string; sku: string; productName: string; qty: number }>();
  for (const [key, qty] of demandAlloc.byWsSku) {
    const [workshopId, sku] = key.split("|");
    demand.set(key, { workshopId, sku, productName: products.find((p) => p.sku === sku)?.productName ?? sku, qty });
  }
  const stockByWsSku = new Map<string, number>();
  for (const inv of inventories) stockByWsSku.set(`${inv.workshopId}|${inv.sku}`, inv.quantity);
  const transitByWsSku = new Map<string, number>();
  for (const l of poLines) {
    const key = `${l.po.workshopId}|${l.sku}`;
    transitByWsSku.set(key, (transitByWsSku.get(key) ?? 0) + Math.max(0, l.quantity - l.receivedQty));
  }

  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const workshopById = new Map(workshops.map((w) => [w.id, w]));
  const rows = [...demand.values()]
    .map((d) => {
      const stock = stockByWsSku.get(`${d.workshopId}|${d.sku}`) ?? 0;
      const transit = transitByWsSku.get(`${d.workshopId}|${d.sku}`) ?? 0;
      const product = productBySku.get(d.sku);
      return {
        key: `${d.workshopId}|${d.sku}`,
        workshopId: d.workshopId,
        workshopName: workshopById.get(d.workshopId)?.name ?? "未知车间",
        sku: d.sku,
        productName: product?.productName ?? d.productName,
        weightPerMeter: product?.weightPerMeter != null ? Number(product.weightPerMeter) : null,
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
          在产/待开工/外协中工单的用料需求 vs 该车间现存 vs 在途采购（未收货），按车间分列（与派单/开工缺料检查同口径）。净缺口可一键生成采购草稿。
          共 {workOrders.length} 张在制工单参与统计。
        </p>
      </div>
      <MaterialDemandTable
        rows={rows}
        suppliers={suppliers}
      />

      <Card>
        <CardHeader>
          <CardTitle>动态补货建议（近 30 天消耗 × 供应商交期 + 3 天安全）</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            可用量 = 全网现存 − 未结工单占用。建议采购量 = 补货点 − 可用量（负数归零不显示噪音）。交期取该 SKU 最近采购单供应商的默认交期，无记录按 7 天。
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="border-b bg-muted/50"><tr className="text-left">
              <th className="p-2">SKU</th><th className="p-2">名称</th>
              <th className="p-2 text-right">现存</th><th className="p-2 text-right">占用</th><th className="p-2 text-right">可用</th>
              <th className="p-2 text-right">日均消耗</th><th className="p-2 text-right">交期(天)</th>
              <th className="p-2 text-right">补货点</th><th className="p-2 text-right">建议采购</th>
            </tr></thead>
            <tbody>
              {reorder.filter((r) => r.suggest > 0 || r.available < 0).map((r) => (
                <tr key={r.sku} className="border-b">
                  <td className="p-2 font-mono text-xs">{r.sku}</td>
                  <td className="p-2 text-xs">{r.productName}</td>
                  <td className="p-2 text-right">{r.onHand}</td>
                  <td className="p-2 text-right text-xs text-amber-300">{r.allocated}</td>
                  <td className={`p-2 text-right font-medium ${r.available < 0 ? "text-rose-700" : ""}`}>{r.available}</td>
                  <td className="p-2 text-right text-xs">{r.dailyUse}</td>
                  <td className="p-2 text-right text-xs">{r.leadDays}</td>
                  <td className="p-2 text-right text-xs">{r.target}</td>
                  <td className="p-2 text-right font-semibold text-sky-300">{r.suggest > 0 ? `${r.suggest} 根` : "缺料 " + (-r.available)}</td>
                </tr>
              ))}
              {reorder.filter((r) => r.suggest > 0 || r.available < 0).length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">暂无补货建议——原料可用量充足或近期无消耗。</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>外协在途物料（工单状态 = 外协中）</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">发往外协加工的原料占用；成品回厂发货时自动补扣，此处即"在外协手里"的账。</p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-muted/50"><tr className="text-left">
              <th className="p-2">外协单位</th><th className="p-2">工单</th><th className="p-2">订单</th>
              <th className="p-2">SKU</th><th className="p-2 text-right">数量</th>
            </tr></thead>
            <tbody>
              {outsourced.map((o, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2 text-xs">{o.workshopName}</td>
                  <td className="p-2 font-mono text-xs">{o.workOrderNo}</td>
                  <td className="p-2 font-mono text-xs">{o.orderNo}</td>
                  <td className="p-2 font-mono text-xs">{o.sku}</td>
                  <td className="p-2 text-right font-medium">{o.quantity}</td>
                </tr>
              ))}
              {outsourced.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">当前没有外协中的工单。</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
