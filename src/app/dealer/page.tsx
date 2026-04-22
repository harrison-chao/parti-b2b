import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils";
import { PRICE_TIER_LABEL } from "@/lib/pricing";

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
                <Link href={`/dealer/orders/${o.orderNo}`} key={o.orderNo} className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded">
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
