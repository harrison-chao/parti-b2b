import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, WORK_ORDER_STATUS_COLOR, WORK_ORDER_STATUS_LABEL } from "@/lib/utils";

export default async function WorkshopHistoryPage() {
  const session = await auth();
  if (!session?.user.workshopId) redirect("/login");
  const workOrders = await prisma.workOrder.findMany({
    where: { workshopId: session.user.workshopId, status: "SHIPPED" },
    orderBy: { actualShippedAt: "desc" },
    include: { order: { select: { orderNo: true, receiverName: true } } },
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">历史加工</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">加工单号</th><th className="p-3">销售单号</th>
              <th className="p-3">收货人</th><th className="p-3">出运时间</th>
              <th className="p-3">物流</th><th className="p-3">状态</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {workOrders.map((wo) => (
                <tr key={wo.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-mono">{wo.workOrderNo}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{wo.order.orderNo}</td>
                  <td className="p-3 text-xs">{wo.order.receiverName}</td>
                  <td className="p-3 text-xs">{wo.actualShippedAt ? formatDateTime(wo.actualShippedAt) : "-"}</td>
                  <td className="p-3 text-xs">{wo.carrier} · {wo.trackingNo}</td>
                  <td className="p-3"><Badge className={WORK_ORDER_STATUS_COLOR[wo.status]}>{WORK_ORDER_STATUS_LABEL[wo.status]}</Badge></td>
                  <td className="p-3"><Link href={`/workshop/orders/${wo.workOrderNo}`} className="text-blue-600 hover:underline text-xs">详情</Link></td>
                </tr>
              ))}
              {workOrders.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">暂无出运记录</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
