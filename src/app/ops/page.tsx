import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils";

export default async function OpsHomePage() {
  const [pending, confirmed, producing, completed, dealerCount, recent, pendingTotal] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">运营驾驶舱</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat label="待审核" value={pending} href="/ops/orders?status=PENDING" tone="amber" />
        <Stat label="已确认" value={confirmed} href="/ops/orders?status=CONFIRMED" tone="blue" />
        <Stat label="生产中" value={producing} href="/ops/orders?status=PRODUCING" tone="indigo" />
        <Stat label="已完成" value={completed} href="/ops/orders?status=COMPLETED" tone="emerald" />
        <Stat label="活跃经销商" value={dealerCount} href="/ops/dealers" />
      </div>

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
                    <td className="p-3"><Link href={`/ops/orders/${o.orderNo}`} className="text-blue-600 text-sm hover:underline">审核</Link></td>
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
