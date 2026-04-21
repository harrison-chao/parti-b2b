import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR } from "@/lib/utils";

export default async function WorkshopHomePage() {
  const session = await auth();
  if (!session?.user.workshopId) redirect("/login");
  const workshop = await prisma.workshop.findUnique({ where: { id: session.user.workshopId } });
  const workOrders = await prisma.workOrder.findMany({
    where: { workshopId: session.user.workshopId, status: { not: "SHIPPED" } },
    orderBy: [{ committedDeliveryDate: "asc" }, { createdAt: "desc" }],
    include: {
      order: { select: { orderNo: true, receiverName: true, targetDeliveryDate: true, lines: { where: { lineType: { not: "OUTSOURCED" } }, select: { quantity: true } } } },
    },
  });
  const now = new Date();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{workshop?.name} · 加工队列</h1>
        <p className="text-sm text-muted-foreground">按承诺交期排序，越靠前越紧急</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">加工单号</th><th className="p-3">销售单号</th>
              <th className="p-3">收货人</th><th className="p-3">承诺交期</th>
              <th className="p-3">品项</th><th className="p-3">状态</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {workOrders.map((wo) => {
                const overdue = wo.committedDeliveryDate && wo.committedDeliveryDate < now;
                const totalQty = wo.order.lines.reduce((s, l) => s + l.quantity, 0);
                return (
                  <tr key={wo.id} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono">{wo.workOrderNo}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{wo.order.orderNo}</td>
                    <td className="p-3 text-xs">{wo.order.receiverName}</td>
                    <td className={`p-3 text-xs ${overdue ? "text-red-600 font-semibold" : ""}`}>
                      {wo.committedDeliveryDate ? formatDate(wo.committedDeliveryDate) : "-"}
                      {overdue && <div>⚠ 已逾期</div>}
                    </td>
                    <td className="p-3 text-xs">{wo.order.lines.length} 行 / {totalQty} 根</td>
                    <td className="p-3"><Badge className={WORK_ORDER_STATUS_COLOR[wo.status]}>{WORK_ORDER_STATUS_LABEL[wo.status]}</Badge></td>
                    <td className="p-3"><Link href={`/workshop/orders/${wo.workOrderNo}`} className="text-blue-600 hover:underline text-xs">详情</Link></td>
                  </tr>
                );
              })}
              {workOrders.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">目前没有进行中的加工单 🎉</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
