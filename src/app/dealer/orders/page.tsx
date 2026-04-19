import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils";

export default async function OrdersPage() {
  const session = await auth();
  const orders = await prisma.salesOrder.findMany({
    where: { dealerId: session!.user.dealerId! },
    orderBy: { createdAt: "desc" },
    include: { lines: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">我的订单</h1>
        <Link href="/dealer/orders/new"><Button>+ 创建订单</Button></Link>
      </div>
      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">暂无订单</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr className="text-left">
                  <th className="p-3">订单号</th>
                  <th className="p-3">下单时间</th>
                  <th className="p-3">交期</th>
                  <th className="p-3">行数</th>
                  <th className="p-3 text-right">金额</th>
                  <th className="p-3">状态</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.orderNo} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono">{o.orderNo}</td>
                    <td className="p-3">{formatDate(o.orderDate)}</td>
                    <td className="p-3">{formatDate(o.targetDeliveryDate)}</td>
                    <td className="p-3">{o.lines.length}</td>
                    <td className="p-3 text-right font-medium">{formatMoney(Number(o.totalAmount))}</td>
                    <td className="p-3"><Badge className={ORDER_STATUS_COLOR[o.orderStatus]}>{ORDER_STATUS_LABEL[o.orderStatus]}</Badge></td>
                    <td className="p-3"><Link href={`/dealer/orders/${o.orderNo}`} className="text-blue-600 hover:underline">查看</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
