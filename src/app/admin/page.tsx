import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils";
import { listDealerStatements, listSupplierStatements, RECEIVABLE_ORDER_STATUSES } from "@/lib/reconcile";

export default async function OpsHomePage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    pending, confirmed, producing, completed, dealerCount,
    recent, pendingTotal,
    mtdSalesAgg, mtdRecvAgg, mtdPOAgg, mtdPayAgg,
    inProductionCount,
    dealerStatements, supplierStatements,
    lowStockCount,
  ] = await Promise.all([
    prisma.salesOrder.count({ where: { orderStatus: "PENDING" } }),
    prisma.salesOrder.count({ where: { orderStatus: "CONFIRMED" } }),
    prisma.salesOrder.count({ where: { orderStatus: "PRODUCING" } }),
    prisma.salesOrder.count({ where: { orderStatus: "COMPLETED" } }),
    prisma.dealer.count({ where: { status: "ACTIVE" } }),
    prisma.salesOrder.findMany({
      where: { orderStatus: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { dealer: { select: { companyName: true } } },
    }),
    prisma.salesOrder.aggregate({ where: { orderStatus: "PENDING" }, _sum: { totalAmount: true } }),
    prisma.salesOrder.aggregate({
      where: {
        orderDate: { gte: monthStart },
        orderStatus: { in: RECEIVABLE_ORDER_STATUSES as any },
      },
      _sum: { totalAmount: true },
    }),
    prisma.dealerPayment.aggregate({
      where: { paidAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.purchaseOrder.aggregate({
      where: { orderDate: { gte: monthStart }, status: { not: "CANCELLED" } },
      _sum: { totalAmount: true },
    }),
    prisma.supplierPayment.aggregate({
      where: { paidAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.salesOrder.count({ where: { orderStatus: { in: ["CONFIRMED", "PRODUCING", "READY"] } } }),
    listDealerStatements(),
    listSupplierStatements(),
    prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM "WorkshopInventory" WHERE "lowStockThreshold" > 0 AND quantity <= "lowStockThreshold"`,
  ]);

  const mtdSales = Number(mtdSalesAgg._sum.totalAmount ?? 0);
  const mtdReceived = Number(mtdRecvAgg._sum.amount ?? 0);
  const mtdPurchase = Number(mtdPOAgg._sum.totalAmount ?? 0);
  const mtdPaid = Number(mtdPayAgg._sum.amount ?? 0);

  const totalReceivable = dealerStatements.reduce((s, r) => s + Number(r.balance), 0);
  const totalPayable = supplierStatements.reduce((s, r) => s + Number(r.balance), 0);

  const topDealers = [...dealerStatements]
    .filter((r) => Number(r.balance) > 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 5);
  const topSuppliers = [...supplierStatements]
    .filter((r) => Number(r.balance) > 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 5);

  const lowStock = Number(lowStockCount[0]?.c ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">运营驾驶舱</h1>
        <span className="text-xs text-muted-foreground">本月起 {formatDate(monthStart)}</span>
      </div>

      {/* Money KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MoneyCard label="本月销售" value={mtdSales} tone="emerald" sub="已确认及以后订单" />
        <MoneyCard label="本月收款" value={mtdReceived} tone="blue" sub="经销商回款" />
        <MoneyCard label="本月采购" value={mtdPurchase} tone="indigo" sub="下单金额" />
        <MoneyCard label="本月付款" value={mtdPaid} tone="slate" sub="支付给供应商" />
        <MoneyCard label="总应收" value={totalReceivable} tone={totalReceivable > 0 ? "red" : "muted"} href="/admin/reconcile/dealers" />
        <MoneyCard label="总应付" value={totalPayable} tone={totalPayable > 0 ? "red" : "muted"} href="/admin/reconcile/suppliers" />
        <MoneyCard label="净现金口径" value={totalReceivable - totalPayable} tone={totalReceivable - totalPayable >= 0 ? "emerald" : "red"} sub="应收 − 应付" />
        <div className="grid grid-cols-2 gap-2">
          <Link href="/admin/orders?status=CONFIRMED" className="block">
            <Card className="hover:shadow-md transition h-full">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">在产订单</div>
                <div className="text-2xl font-bold text-indigo-600">{inProductionCount}</div>
              </CardContent>
            </Card>
          </Link>
          <Card className={lowStock > 0 ? "border-amber-400" : ""}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">低库存 SKU</div>
              <div className={`text-2xl font-bold ${lowStock > 0 ? "text-amber-600" : "text-muted-foreground"}`}>{lowStock}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Order pipeline */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="待审核" value={pending} href="/admin/orders?status=PENDING" tone="amber" />
        <Stat label="已确认" value={confirmed} href="/admin/orders?status=CONFIRMED" tone="blue" />
        <Stat label="生产中" value={producing} href="/admin/orders?status=PRODUCING" tone="indigo" />
        <Stat label="已完成" value={completed} href="/admin/orders?status=COMPLETED" tone="emerald" />
        <Stat label="活跃经销商" value={dealerCount} href="/admin/dealers" />
      </div>

      {/* Top-balance lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex-row flex items-center justify-between">
            <CardTitle>应收 Top 5</CardTitle>
            <Link href="/admin/reconcile/dealers" className="text-xs text-blue-600 hover:underline">全部 →</Link>
          </CardHeader>
          <CardContent className="p-0">
            {topDealers.length === 0 ? <p className="p-4 text-muted-foreground text-sm">没有应收余额。</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {topDealers.map((r) => (
                    <tr key={r.dealerId} className="border-b last:border-0">
                      <td className="p-3 font-mono text-xs">{r.dealerNo}</td>
                      <td className="p-3"><Link href={`/admin/reconcile/dealers/${r.dealerId}`} className="text-blue-600 hover:underline">{r.companyName}</Link></td>
                      <td className="p-3 text-right font-medium text-red-600">{formatMoney(Number(r.balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row flex items-center justify-between">
            <CardTitle>应付 Top 5</CardTitle>
            <Link href="/admin/reconcile/suppliers" className="text-xs text-blue-600 hover:underline">全部 →</Link>
          </CardHeader>
          <CardContent className="p-0">
            {topSuppliers.length === 0 ? <p className="p-4 text-muted-foreground text-sm">没有应付余额。</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {topSuppliers.map((r) => (
                    <tr key={r.supplierId} className="border-b last:border-0">
                      <td className="p-3 font-mono text-xs">{r.supplierNo}</td>
                      <td className="p-3"><Link href={`/admin/reconcile/suppliers/${r.supplierId}`} className="text-blue-600 hover:underline">{r.name}</Link></td>
                      <td className="p-3 text-right font-medium text-red-600">{formatMoney(Number(r.balance))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending orders */}
      <Card>
        <CardHeader className="flex-row flex items-center justify-between">
          <CardTitle>待审核订单</CardTitle>
          <span className="text-sm text-muted-foreground">合计金额 {formatMoney(Number(pendingTotal._sum.totalAmount ?? 0))}</span>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <p className="p-6 text-muted-foreground text-sm">暂无待审核订单</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b"><tr className="text-left">
                <th className="p-3">订单号</th><th className="p-3">经销商</th>
                <th className="p-3">下单</th><th className="p-3">期望交期</th>
                <th className="p-3 text-right">金额</th><th className="p-3">状态</th><th></th>
              </tr></thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.orderNo} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono">{o.orderNo}</td>
                    <td className="p-3">{o.dealer.companyName}</td>
                    <td className="p-3">{formatDate(o.orderDate)}</td>
                    <td className="p-3">{formatDate(o.targetDeliveryDate)}</td>
                    <td className="p-3 text-right font-medium">{formatMoney(Number(o.totalAmount))}</td>
                    <td className="p-3"><Badge className={ORDER_STATUS_COLOR[o.orderStatus]}>{ORDER_STATUS_LABEL[o.orderStatus]}</Badge></td>
                    <td className="p-3"><Link href={`/admin/orders/${o.orderNo}`} className="text-blue-600 text-sm hover:underline">审核</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: number; href: string; tone?: string }) {
  const colorMap: Record<string, string> = {
    amber: "text-amber-600",
    blue: "text-blue-600",
    indigo: "text-indigo-600",
    emerald: "text-emerald-600",
  };
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition cursor-pointer">
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-3xl font-bold mt-1 ${tone ? colorMap[tone] : ""}`}>{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MoneyCard({ label, value, tone, sub, href }: {
  label: string; value: number; tone?: "emerald" | "blue" | "indigo" | "slate" | "red" | "muted"; sub?: string; href?: string;
}) {
  const toneMap: Record<string, string> = {
    emerald: "text-emerald-700", blue: "text-blue-700", indigo: "text-indigo-700",
    slate: "text-slate-900", red: "text-red-600", muted: "text-muted-foreground",
  };
  const body = (
    <Card className={href ? "hover:shadow-md transition cursor-pointer h-full" : "h-full"}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold mt-1 ${tone ? toneMap[tone] : ""}`}>{formatMoney(value)}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
