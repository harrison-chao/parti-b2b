import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils";

const STATUSES = ["", "PENDING", "MODIFYING", "CONFIRMED", "PRODUCING", "SHIPPED", "COMPLETED", "REJECTED", "CANCELLED"];

export default async function OpsOrdersPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status;
  const where: any = {};
  if (status) where.orderStatus = status;
  const orders = await prisma.salesOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { dealer: { select: { companyName: true, dealerNo: true } }, lines: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">销售订单</h1>
      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => {
          const active = (status ?? "") === s;
          return (
            <Link
              key={s || "all"}
              href={s ? `/admin/orders?status=${s}` : "/admin/orders"}
              className={`px-3 py-1.5 rounded-full text-sm ${active ? "bg-slate-900 text-white" : "bg-white border hover:bg-slate-50"}`}
            >
              {s ? ORDER_STATUS_LABEL[s] : "全部"}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <p className="p-6 text-muted-foreground text-sm">无订单</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b"><tr className="text-left">
                <th className="p-3">订单号</th><th className="p-3">经销商</th>
                <th className="p-3">下单</th><th className="p-3">交期</th>
                <th className="p-3">行数</th><th className="p-3 text-right">金额</th>
                <th className="p-3">状态</th><th></th>
              </tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.orderNo} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono">{o.orderNo}</td>
                    <td className="p-3">{o.dealer.companyName}<div className="text-xs text-muted-foreground font-mono">{o.dealer.dealerNo}</div></td>
                    <td className="p-3">{formatDate(o.orderDate)}</td>
                    <td className="p-3">{formatDate(o.targetDeliveryDate)}</td>
                    <td className="p-3">{o.lines.length}</td>
                    <td className="p-3 text-right font-medium">{formatMoney(Number(o.totalAmount))}</td>
                    <td className="p-3"><Badge className={ORDER_STATUS_COLOR[o.orderStatus]}>{ORDER_STATUS_LABEL[o.orderStatus]}</Badge></td>
                    <td className="p-3"><Link href={`/admin/orders/${o.orderNo}`} className="text-blue-600 hover:underline">{o.orderStatus === "PENDING" ? "审核" : "查看"}</Link></td>
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
