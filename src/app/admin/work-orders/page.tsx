import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR } from "@/lib/utils";

export default async function AdminWorkOrdersPage() {
  const workOrders = await prisma.workOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      workshop: { select: { code: true, name: true } },
      order: { select: { orderNo: true, totalAmount: true, dealer: { select: { companyName: true, dealerNo: true } } } },
    },
  });
  const now = new Date();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">加工制单</h1>
        <p className="text-sm text-muted-foreground">追踪所有派发中的加工单</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">加工单号</th><th className="p-3">销售订单</th>
              <th className="p-3">经销商</th><th className="p-3">车间</th>
              <th className="p-3">状态</th><th className="p-3">承诺交期</th>
              <th className="p-3">物流</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {workOrders.map((wo) => {
                const overdue = wo.committedDeliveryDate && wo.status !== "SHIPPED" && wo.committedDeliveryDate < now;
                return (
                  <tr key={wo.id} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono">{wo.workOrderNo}</td>
                    <td className="p-3 font-mono text-xs">
                      <Link href={`/admin/orders/${wo.orderNo}`} className="text-blue-600 hover:underline">{wo.orderNo}</Link>
                    </td>
                    <td className="p-3 text-xs">{wo.order.dealer.companyName}<div className="text-muted-foreground">{wo.order.dealer.dealerNo}</div></td>
                    <td className="p-3 text-xs">{wo.workshop.code} · {wo.workshop.name}</td>
                    <td className="p-3"><Badge className={WORK_ORDER_STATUS_COLOR[wo.status]}>{WORK_ORDER_STATUS_LABEL[wo.status]}</Badge></td>
                    <td className={`p-3 text-xs ${overdue ? "text-red-600 font-semibold" : ""}`}>
                      {wo.committedDeliveryDate ? formatDate(wo.committedDeliveryDate) : "-"}
                      {overdue && <div className="text-xs">⚠ 已延期</div>}
                    </td>
                    <td className="p-3 text-xs">{wo.carrier ? `${wo.carrier} · ${wo.trackingNo ?? ""}` : "-"}</td>
                    <td className="p-3"><Link href={`/admin/work-orders/${wo.workOrderNo}`} className="text-blue-600 hover:underline text-xs">详情</Link></td>
                  </tr>
                );
              })}
              {workOrders.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">暂无加工单。到销售订单详情页点击"一键加工派单"开始。</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
