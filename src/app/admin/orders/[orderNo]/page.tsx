import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate, formatDateTime, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils";
import { calcPricing, PRICE_TIER_LABEL } from "@/lib/pricing";
import { loadSettings, pricingFieldsToConfig } from "@/lib/settings";
import { ReviewPanel } from "./review-panel";
import { OrderLineCostRow } from "./cost-row";
import { DispatchPanel } from "./dispatch-panel";

const PAYMENT_LABELS: Record<string, string> = { PREPAID: "预付款", DEPOSIT: "定金", CREDIT: "信用额度" };

export default async function AdminOrderDetailPage({ params }: { params: { orderNo: string } }) {
  const order = await prisma.salesOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: {
      lines: { orderBy: { lineNo: "asc" } },
      dealer: true,
      workOrder: { include: { workshop: true } },
    },
  });
  if (!order) notFound();

  const workshops = await prisma.workshop.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  const hasProducibleLines = order.lines.some((l) => l.lineType !== "OUTSOURCED");
  const canDispatch = ["CONFIRMED", "PARTIALLY_PAID", "PRODUCING", "READY", "SHIPPED"].includes(order.orderStatus) && hasProducibleLines;
  const existingWo = order.workOrder ? {
    workOrderNo: order.workOrder.workOrderNo,
    status: order.workOrder.status,
    workshopName: order.workOrder.workshop.name,
    committedDeliveryDate: order.workOrder.committedDeliveryDate?.toISOString() ?? null,
    actualShippedAt: order.workOrder.actualShippedAt?.toISOString() ?? null,
    carrier: order.workOrder.carrier,
    trackingNo: order.workOrder.trackingNo,
    qcRequired: order.workOrder.qcRequired,
    currentNote: order.workOrder.currentNote,
    delayReason: order.workOrder.delayReason,
    assignedBy: order.workOrder.assignedBy,
    assignedAt: order.workOrder.assignedAt.toISOString(),
  } : null;

  const settings = await loadSettings();
  const config = pricingFieldsToConfig(settings.pricingFields);
  const level = order.dealer.priceLevel;

  const lineCosts = order.lines.map((l) => {
    const mm = l.lengthMm ? Number(l.lengthMm) : 0;
    if (!mm) return { lineNo: l.lineNo, mm: 0, pricing: null as any };
    const p = calcPricing(mm, level, config, settings.discountRates);
    return { lineNo: l.lineNo, mm, pricing: p };
  });
  const byLineNo = new Map(lineCosts.map((c) => [c.lineNo, c]));

  const totalCost = order.lines.reduce((s, l) => {
    if (!l.includedInProfit) return s;
    const c = byLineNo.get(l.lineNo)?.pricing;
    if (c) return s + c.totalCost * l.quantity;
    // Non-PROFILE lines (OUTSOURCED/HARDWARE) without pricing breakdown: treat unitPrice as cost pass-through
    if (l.lineType === "OUTSOURCED" || l.lineType === "HARDWARE") return s + Number(l.unitPrice) * l.quantity;
    return s;
  }, 0);
  const profitRevenue = order.lines.reduce(
    (s, l) => s + (l.includedInProfit ? Number(l.lineAmount) : 0),
    0,
  );
  const dealerTotal = Number(order.totalAmount);
  const adminProfit = profitRevenue - totalCost;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono">{order.orderNo}</h1>
          <p className="text-sm text-muted-foreground">{order.dealer.companyName} · {order.dealer.dealerNo}</p>
        </div>
        <Badge className={ORDER_STATUS_COLOR[order.orderStatus] + " text-base px-3 py-1"}>{ORDER_STATUS_LABEL[order.orderStatus]}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>订单信息</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row k="下单日期" v={formatDate(order.orderDate)} />
                <Row k="期望交期" v={formatDate(order.targetDeliveryDate)} />
                {order.suggestedDeliveryDate && <Row k="建议交期" v={formatDate(order.suggestedDeliveryDate)} />}
                <Row k="下单账号" v={order.dealerAccount} />
                {order.reviewer && <Row k="审核人" v={order.reviewer} />}
                {order.reviewTime && <Row k="审核时间" v={formatDateTime(order.reviewTime)} />}
                {order.reviewRemark && <Row k="审核备注" v={order.reviewRemark} />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>经销商 & 收货</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row k="经销商等级" v={PRICE_TIER_LABEL[order.dealer.priceLevel as "A"|"B"|"C"] ?? order.dealer.priceLevel} />
                <Row k="结算方式" v={PAYMENT_LABELS[order.dealer.paymentMethod] ?? order.dealer.paymentMethod} />
                <Row k="信用余额" v={formatMoney(Number(order.dealer.creditBalance))} />
                <div className="border-t pt-2 mt-2"></div>
                <Row k="收货人" v={order.receiverName} />
                <Row k="电话" v={order.receiverPhone} />
                <Row k="地址" v={order.receiverAddress} />
                {order.remark && <Row k="客户备注" v={order.remark} />}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>订单明细（含利润核算）</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b"><tr className="text-left">
                  <th className="p-3">#</th><th className="p-3">产品</th><th className="p-3">SKU</th>
                  <th className="p-3 text-right">数量</th>
                  <th className="p-3 text-right">单位成本</th>
                  <th className="p-3 text-right">采购单价</th>
                  <th className="p-3 text-right">单根毛利</th>
                  <th className="p-3 text-right">小计</th>
                  <th className="p-3"></th>
                </tr></thead>
                <tbody>
                  {order.lines.map((l) => {
                    const c = byLineNo.get(l.lineNo);
                    return (
                      <OrderLineCostRow
                        key={l.id}
                        orderNo={order.orderNo}
                        line={{
                          id: l.id,
                          lineNo: l.lineNo,
                          lineType: l.lineType,
                          productName: l.productName,
                          sku: l.sku,
                          preprocessing: l.preprocessing,
                          drawingUrl: l.drawingUrl,
                          drawingFileName: l.drawingFileName,
                          quantity: l.quantity,
                          unitPrice: Number(l.unitPrice),
                          lineAmount: Number(l.lineAmount),
                          includedInProfit: l.includedInProfit,
                        }}
                        costBreakdown={c?.pricing ? {
                          totalCost: c.pricing.totalCost,
                          materialCost: c.pricing.materialCost,
                          surfaceCost: c.pricing.surfaceCost,
                          processingCost: c.pricing.processingCost,
                          connectorCost: c.pricing.connectorCost,
                          retailPrice: c.pricing.retailPrice,
                          actualWeight: c.pricing.actualWeight,
                        } : null}
                      />
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td colSpan={4} className="p-3 text-right font-semibold">成本合计</td>
                    <td colSpan={3} className="p-3 text-right font-semibold">{formatMoney(totalCost)}</td>
                    <td className="p-3 text-right font-bold text-emerald-700 text-lg">{formatMoney(dealerTotal)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="p-3 text-right font-semibold text-xs text-muted-foreground">纳入利润核算收入（勾选行合计）</td>
                    <td className="p-3 text-right text-sm">{formatMoney(profitRevenue)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="p-3 text-right font-semibold">本单利润（核算收入 − 核算成本）</td>
                    <td className={`p-3 text-right font-bold text-lg ${adminProfit >= 0 ? "text-blue-700" : "text-red-600"}`}>{formatMoney(adminProfit)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {order.orderStatus === "PENDING" ? (
            <ReviewPanel orderNo={order.orderNo} defaultAmount={Number(order.totalAmount)} />
          ) : (
            <Card>
              <CardHeader><CardTitle>审核状态</CardTitle></CardHeader>
              <CardContent>
                <Badge className={ORDER_STATUS_COLOR[order.orderStatus] + " text-base px-3 py-1"}>{ORDER_STATUS_LABEL[order.orderStatus]}</Badge>
                {order.orderStatus !== "DRAFT" && !order.reviewer && (
                  <p className="text-sm text-muted-foreground mt-3">该订单尚未经过审核</p>
                )}
              </CardContent>
            </Card>
          )}
          {canDispatch && (
            <DispatchPanel
              orderNo={order.orderNo}
              targetDeliveryDate={order.targetDeliveryDate.toISOString()}
              workshops={workshops}
              existing={existingWo}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
}
