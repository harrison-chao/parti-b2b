import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils";
import { PRICE_TIER_LABEL } from "@/lib/pricing";
import { RECEIVABLE_ORDER_STATUSES } from "@/lib/reconcile";

export default async function DealerHomePage() {
  const session = await auth();
  const dealerId = session!.user.dealerId!;
  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  const recentOrders = await prisma.salesOrder.findMany({
    where: { dealerId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const pending = await prisma.salesOrder.count({ where: { dealerId, orderStatus: "PENDING" } });
  const producing = await prisma.salesOrder.count({ where: { dealerId, orderStatus: "PRODUCING" } });

  // ── 财务看板：与客户对账（reconcile）同口径，经销商自助可见 ──
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const [monthAgg, receivableOrders, payments, recentPayments] = await Promise.all([
    // 本月下单（撤单除外，草稿/待审核也计入经营视角）
    prisma.salesOrder.aggregate({
      where: { dealerId, createdAt: { gte: monthStart }, orderStatus: { not: "CANCELLED" } },
      _sum: { totalAmount: true }, _count: true,
    }),
    // 应收口径 = 对账单同源（含部分发货）；balance = receivable - 已收款
    prisma.salesOrder.findMany({
      where: { dealerId, legacyBaseNo: null, orderStatus: { in: RECEIVABLE_ORDER_STATUSES as any } },
      select: { totalAmount: true, confirmedAmount: true },
    }),
    prisma.dealerPayment.aggregate({ where: { dealerId }, _sum: { amount: true } }),
    prisma.dealerPayment.findMany({ where: { dealerId }, orderBy: { paidAt: "desc" }, take: 5 }),
  ]);
  const receivable = receivableOrders.reduce((s, o) => s + Number(o.confirmedAmount ?? o.totalAmount), 0);
  const paidTotal = Number(payments._sum.amount ?? 0);
  const balance = receivable - paidTotal;
  const monthTotal = Number(monthAgg._sum.totalAmount ?? 0);
  const creditUsed = Number(dealer?.creditLimit ?? 0) - Number(dealer?.creditBalance ?? 0);
  const creditPct = dealer && Number(dealer.creditLimit) > 0 ? Math.min(100, Math.round((creditUsed / Number(dealer.creditLimit)) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">欢迎，{dealer?.companyName}</h1>
        <p className="text-muted-foreground text-sm">
          经销商编号 {dealer?.dealerNo} · 等级 {dealer ? (PRICE_TIER_LABEL[dealer.priceLevel as "A"|"B"|"C"] ?? dealer.priceLevel) : "-"} · 结算方式 {dealer?.paymentMethod}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">信用额度</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatMoney(Number(dealer?.creditLimit ?? 0))}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">可用额度</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-emerald-600">{formatMoney(Number(dealer?.creditBalance ?? 0))}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">待审核</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{pending}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">生产中</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{producing}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>财务概览</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">本月下单</p>
              <p className="text-2xl font-bold">{formatMoney(monthTotal)}</p>
              <p className="text-xs text-muted-foreground">{monthAgg._count} 单</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">应付余额（对账口径）</p>
              <p className={`text-2xl font-bold ${balance > 0 ? "text-amber-500" : "text-emerald-600"}`}>{formatMoney(balance)}</p>
              <p className="text-xs text-muted-foreground">累计应收 {formatMoney(receivable)} · 已付 {formatMoney(paidTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">信用占用</p>
              <p className="text-2xl font-bold">{formatMoney(creditUsed)}</p>
              <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
                <div className={`h-full ${creditPct >= 80 ? "bg-red-500" : "bg-sky-500"}`} style={{ width: `${creditPct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">额度使用 {creditPct}%</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">最近付款</p>
              <span className="text-xs text-muted-foreground">如需对账单请联系商务导出</span>
            </div>
            {recentPayments.length === 0 ? (
              <p className="text-muted-foreground text-sm">暂无付款记录</p>
            ) : (
              <div className="divide-y">
                {recentPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium text-emerald-600">{formatMoney(Number(p.amount))}</span>
                      <span className="text-muted-foreground ml-2">{formatDate(p.paidAt)}</span>
                      {p.method && <span className="text-muted-foreground ml-2">· {p.method}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground truncate max-w-[40%]">{p.note ?? p.refNo ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/dealer/quote"><Card className="hover:shadow-md transition cursor-pointer"><CardContent className="p-6"><div className="font-semibold">📐 报价下单</div><p className="text-sm text-muted-foreground mt-1">多行定制报价，直接提交审核</p></CardContent></Card></Link>
        <Link href="/dealer/orders"><Card className="hover:shadow-md transition cursor-pointer"><CardContent className="p-6"><div className="font-semibold">📋 我的订单</div><p className="text-sm text-muted-foreground mt-1">订单列表与状态跟踪</p></CardContent></Card></Link>
      </div>

      <Card>
        <CardHeader><CardTitle>最近订单</CardTitle></CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无订单</p>
          ) : (
            <div className="divide-y">
              {recentOrders.map((o) => (
                <Link href={`/dealer/orders/${o.orderNo}`} key={o.orderNo} className="flex items-center justify-between py-3 hover:bg-muted/50 -mx-2 px-2 rounded">
                  <div>
                    <div className="font-medium">{o.orderNo}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(o.orderDate)} · 交期 {formatDate(o.targetDeliveryDate)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{formatMoney(Number(o.totalAmount))}</span>
                    <Badge className={ORDER_STATUS_COLOR[o.orderStatus]}>{ORDER_STATUS_LABEL[o.orderStatus]}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
