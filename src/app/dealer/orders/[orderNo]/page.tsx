import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate, formatDateTime, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR, WORK_ORDER_STATUS_FLOW, ORDER_LINE_TYPE_LABEL, ORDER_LINE_TYPE_COLOR } from "@/lib/utils";
import { SubmitBtn } from "./actions";

export default async function OrderDetailPage({ params }: { params: { orderNo: string } }) {
  const session = await auth();
  const order = await prisma.salesOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: { lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!order || order.dealerId !== session!.user.dealerId) notFound();
  const workOrder = await prisma.workOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: {
      workshop: { select: { name: true, contactPhone: true } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });

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

      {workOrder && (
        <Card>
          <CardHeader><CardTitle>加工进度</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Row k="加工单号" v={workOrder.workOrderNo} />
              <Row k="加工车间" v={workOrder.workshop.name} />
              <Row k="承诺交期" v={workOrder.committedDeliveryDate ? formatDate(workOrder.committedDeliveryDate) : "-"} />
              <Row k="当前状态" v={WORK_ORDER_STATUS_LABEL[workOrder.status]} />
            </div>
            <div className="flex items-center gap-1 flex-wrap pt-2">
              {WORK_ORDER_STATUS_FLOW.filter((s) => s !== "QC" || workOrder.qcRequired).map((s, i, arr) => {
                const currentIdx = arr.indexOf(workOrder.status);
                const done = i <= currentIdx;
                return (
                  <div key={s} className="flex items-center gap-1">
                    <Badge className={done ? WORK_ORDER_STATUS_COLOR[s] : "bg-slate-100 text-slate-400"}>
                      {WORK_ORDER_STATUS_LABEL[s]}
                    </Badge>
                    {i < arr.length - 1 && <span className="text-slate-300">→</span>}
                  </div>
                );
              })}
            </div>
            {workOrder.status === "SHIPPED" && (
              <div className="rounded border bg-emerald-50 p-3 text-xs">
                已出运 · 物流 {workOrder.carrier} · 单号 {workOrder.trackingNo}
                {workOrder.actualShippedAt && <> · {formatDateTime(workOrder.actualShippedAt)}</>}
              </div>
            )}
            {workOrder.delayReason && (
              <div className="rounded border bg-amber-50 p-3 text-xs text-amber-900">
                ⚠ 延期说明：{workOrder.delayReason}
              </div>
            )}
            <div className="border-t pt-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2">操作记录</div>
              <ul className="space-y-1.5">
                {workOrder.events.map((ev) => (
                  <li key={ev.id} className="text-xs flex gap-3">
                    <span className="text-muted-foreground shrink-0 w-36">{formatDateTime(ev.createdAt)}</span>
                    <span className="shrink-0">
                      {ev.fromStatus ? `${WORK_ORDER_STATUS_LABEL[ev.fromStatus]} → ` : ""}
                      <b>{WORK_ORDER_STATUS_LABEL[ev.toStatus]}</b>
                    </span>
                    {ev.note && <span className="text-muted-foreground">· {ev.note}</span>}
                  </li>
                ))}
                {workOrder.events.length === 0 && <li className="text-xs text-muted-foreground">暂无</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

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
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Badge className={ORDER_LINE_TYPE_COLOR[l.lineType] + " text-[10px]"}>{ORDER_LINE_TYPE_LABEL[l.lineType]}</Badge>
                        <span>{l.productName}</span>
                      </div>
                      {l.drawingUrl && (
                        <a href={l.drawingUrl} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline">
                          📎 图纸 {l.drawingFileName ?? ""}
                        </a>
                      )}
                    </td>
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
