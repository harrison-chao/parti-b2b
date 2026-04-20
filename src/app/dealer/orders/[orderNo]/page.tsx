import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate, formatDateTime, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils";
import { SubmitBtn } from "./actions";

export default async function OrderDetailPage({ params }: { params: { orderNo: string } }) {
  const session = await auth();
  const order = await prisma.salesOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!order || order.dealerId !== session!.user.dealerId) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono">{order.orderNo}</h1>
          <p className="text-sm text-muted-foreground">创建于 {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={ORDER_STATUS_COLOR[order.orderStatus] + " text-base px-3 py-1"}>{ORDER_STATUS_LABEL[order.orderStatus]}</Badge>
          {(order.orderStatus === "DRAFT" || order.orderStatus === "MODIFYING") && <SubmitBtn orderNo={order.orderNo} />}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>订单信息</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="下单日期" v={formatDate(order.orderDate)} />
            <Row k="期望交期" v={formatDate(order.targetDeliveryDate)} />
            {order.suggestedDeliveryDate && <Row k="建议交期" v={formatDate(order.suggestedDeliveryDate)} />}
            <Row k="付款方式" v={order.paymentStatus} />
            {order.reviewer && <Row k="审核人" v={order.reviewer} />}
            {order.reviewTime && <Row k="审核时间" v={formatDateTime(order.reviewTime)} />}
            {order.reviewRemark && <Row k="审核备注" v={order.reviewRemark} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>收货信息</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="收货人" v={order.receiverName} />
            <Row k="电话" v={order.receiverPhone} />
            <Row k="地址" v={order.receiverAddress} />
            {order.remark && <Row k="备注" v={order.remark} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>订单明细</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">#</th><th className="p-3">产品</th><th className="p-3">SKU</th>
              <th className="p-3">加工</th><th className="p-3 text-right">数量</th>
              <th className="p-3 text-right">采购单价</th>
              <th className="p-3 text-right">目标售价</th>
              <th className="p-3 text-right">单根毛利</th>
              <th className="p-3 text-right">采购小计</th>
            </tr></thead>
            <tbody>
              {order.lines.map((l) => {
                const target = l.targetPrice == null ? null : Number(l.targetPrice);
                const profit = target == null ? null : target - Number(l.unitPrice);
                return (
                  <tr key={l.id} className="border-b">
                    <td className="p-3">{l.lineNo}</td>
                    <td className="p-3">{l.productName}</td>
                    <td className="p-3 font-mono text-xs">{l.sku}</td>
                    <td className="p-3 text-xs">{l.preprocessing || "-"}</td>
                    <td className="p-3 text-right">{l.quantity}</td>
                    <td className="p-3 text-right">{formatMoney(Number(l.unitPrice))}</td>
                    <td className="p-3 text-right">{target != null ? formatMoney(target) : "-"}</td>
                    <td className={`p-3 text-right ${profit == null ? "" : profit >= 0 ? "text-blue-700" : "text-red-600"}`}>
                      {profit != null ? formatMoney(profit) : "-"}
                    </td>
                    <td className="p-3 text-right font-medium">{formatMoney(Number(l.lineAmount))}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50">
              {(() => {
                const targetTotal = order.lines.reduce((s, l) => s + (l.targetPrice == null ? Number(l.unitPrice) : Number(l.targetPrice)) * l.quantity, 0);
                const profitTotal = targetTotal - Number(order.totalAmount);
                return (
                  <>
                    <tr><td colSpan={8} className="p-3 text-right font-semibold">采购总金额</td>
                      <td className="p-3 text-right font-bold text-emerald-700 text-lg">{formatMoney(Number(order.totalAmount))}</td></tr>
                    <tr><td colSpan={8} className="p-3 text-right text-sm">目标销售总金额</td>
                      <td className="p-3 text-right">{formatMoney(targetTotal)}</td></tr>
                    <tr><td colSpan={8} className="p-3 text-right font-semibold">本单预计总毛利</td>
                      <td className={`p-3 text-right font-bold ${profitTotal >= 0 ? "text-blue-700" : "text-red-600"}`}>{formatMoney(profitTotal)}</td></tr>
                  </>
                );
              })()}
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
}
