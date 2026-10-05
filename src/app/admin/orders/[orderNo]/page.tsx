import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate, formatDateTime, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils";
import { calcPricing, PRICE_TIER_LABEL } from "@/lib/pricing";
import { loadSettings, pricingFieldsToConfig } from "@/lib/settings";
import { queueLoad, skuCycleStats, globalCycleStats, suggestDeliveryDays } from "@/lib/delivery-insight";
import { ReviewPanel } from "./review-panel";
import { OrderLineCostRow } from "./cost-row";
import { DispatchPanel } from "./dispatch-panel";
import { OrderActions } from "./order-actions";

const PAYMENT_LABELS: Record<string, string> = { PREPAID: "预付款", DEPOSIT: "定金", CREDIT: "信用额度" };

export default async function AdminOrderDetailPage({ params }: { params: { orderNo: string } }) {
  const order = await prisma.salesOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: {
      lines: { orderBy: { lineNo: "asc" }, include: { shipmentLines: { include: { shipment: true } } } },
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
    committedOverrideReason: order.workOrder.committedOverrideReason,
    actualShippedAt: order.workOrder.actualShippedAt?.toISOString() ?? null,
    carrier: order.workOrder.carrier,
    trackingNo: order.workOrder.trackingNo,
    qcRequired: order.workOrder.qcRequired,
    currentNote: order.workOrder.currentNote,
    delayReason: order.workOrder.delayReason,
    assignedBy: order.workOrder.assignedBy,
    assignedAt: order.workOrder.assignedAt.toISOString(),
  } : null;

  // P1-A: 交期承诺洞察（未派单时计算供面板展示）
  let insight: { suggestedDate: string; suggestedDays: number; basis: string; inProduction: number; dueIn7d: number; weeklyThroughput: number } | null = null;
  if (!order.workOrder && hasProducibleLines) {
    const rawIds = [...new Set(order.lines.filter((l) => l.rawProductId).map((l) => l.rawProductId!))];
    const [load, skuStats, globalStats] = await Promise.all([
      queueLoad(),
      rawIds.length ? skuCycleStats(rawIds) : Promise.resolve(new Map()),
      globalCycleStats(),
    ]);
    const skuStat = rawIds.length === 1 ? (skuStats.get(rawIds[0]) ?? null) : (skuStats.size ? [...skuStats.values()][0] : null);
    const suggestion = suggestDeliveryDays(skuStat ?? globalStats, load, order.targetDeliveryDate);
    insight = {
      suggestedDate: new Date(Date.now() + suggestion.days * 86400000).toISOString(),
      suggestedDays: suggestion.days,
      basis: suggestion.basis,
      inProduction: load.inProduction,
      dueIn7d: load.dueIn7d,
      weeklyThroughput: load.weeklyThroughput,
    };
  }

  const settings = await loadSettings();
  const config = pricingFieldsToConfig(settings.pricingFields);
  const level = order.dealer.priceLevel;

  const lineCosts = order.lines.map((l) => {
    // 加工行按切长算成本（与下单算价同口径）；未记切长才回退型材标称长
    const mm = l.cutLengthMm ? Number(l.cutLengthMm) : l.lengthMm ? Number(l.lengthMm) : 0;
    // 下单冻结的成本快照优先（口径切换）：历史订单毛利不随定价参数/批次价漂移；损坏或缺失回退实时估算
    if (l.costSnapshot) {
      try {
        const snap = JSON.parse(l.costSnapshot);
        if (typeof snap?.unitCost === "number") {
          return {
            lineNo: l.lineNo,
            mm,
            pricing: {
              totalCost: snap.unitCost,
              snapshot: true,
              costSource: snap.source ?? "SETTINGS",
              perMeterPrice: snap.perMeterPrice ?? null,
              meterWeight: snap.meterWeight ?? null,
              yieldRate: snap.yieldRate ?? null,
              cutLengthMm: snap.cutLengthMm ?? mm,
            } as any,
          };
        }
      } catch { /* 快照损坏，走实时估算 */ }
    }
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
          {order.displayOrderNo && <span className="text-sm text-muted-foreground">对外单号 {order.displayOrderNo}</span>}
          <p className="text-sm text-muted-foreground">{order.dealer.companyName} · {order.dealer.dealerNo}</p>
        </div>
        <Badge className={ORDER_STATUS_COLOR[order.orderStatus] + " text-base px-3 py-1"}>{ORDER_STATUS_LABEL[order.orderStatus]}</Badge>
          <a href={`/admin/orders/new?copy=${order.orderNo}`} className="text-sm text-sky-400 hover:underline">再来一单</a>
          <a href={`/print/confirm/${order.orderNo}`} target="_blank" className="text-sm text-cyan-300 hover:underline">订单确认书 ↗</a>
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
                <thead className="bg-muted/50 border-b"><tr className="text-left">
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
                          snapshot: (c.pricing as any).snapshot ?? false,
                          costSource: (c.pricing as any).costSource,
                          perMeterPrice: (c.pricing as any).perMeterPrice ?? null,
                          meterWeight: (c.pricing as any).meterWeight ?? null,
                          yieldRate: (c.pricing as any).yieldRate ?? null,
                          cutLengthMm: (c.pricing as any).cutLengthMm ?? null,
                        } : null}
                      />
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/50">
                  <tr>
                    <td colSpan={4} className="p-3 text-right font-semibold">成本合计</td>
                    <td colSpan={3} className="p-3 text-right font-semibold">{formatMoney(totalCost)}</td>
                    <td className="p-3 text-right font-bold text-emerald-300 text-lg">{formatMoney(dealerTotal)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="p-3 text-right font-semibold text-xs text-muted-foreground">纳入利润核算收入（勾选行合计）</td>
                    <td className="p-3 text-right text-sm">{formatMoney(profitRevenue)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="p-3 text-right font-semibold">本单利润（核算收入 − 核算成本）</td>
                    <td className={`p-3 text-right font-bold text-lg ${adminProfit >= 0 ? "text-sky-300" : "text-red-400"}`}>{formatMoney(adminProfit)}</td>
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
              insight={insight}
            />
          )}
          <OrderActions
            orderNo={order.orderNo}
            orderStatus={order.orderStatus}
            paidAmount={Number(order.paidAmount)}
          />
        </div>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">发货记录（Shipment）</CardTitle></CardHeader>
          <CardContent>
            {(() => {
              const shipments = new Map<string, { shippedAt: Date; carrier: string; trackingNo: string | null; freightPayType: string; fromType: string; note: string | null; items: string[] }>();
              for (const l of order.lines) {
                for (const sl of l.shipmentLines) {
                  const sh = sl.shipment;
                  if (!shipments.has(sh.shipmentNo)) shipments.set(sh.shipmentNo, {
                    shippedAt: sh.shippedAt, carrier: sh.carrier, trackingNo: sh.trackingNo,
                    freightPayType: sh.freightPayType, fromType: sh.fromType, note: sh.note, items: [],
                  });
                  shipments.get(sh.shipmentNo)!.items.push(`${l.sku} ×${sl.quantity}`);
                }
              }
              const list = [...shipments.entries()].sort((a, b) => b[1].shippedAt.getTime() - a[1].shippedAt.getTime());
              if (!list.length) return <p className="text-sm text-muted-foreground">暂无发货记录</p>;
              return (
                <div className="space-y-3">
                  {list.map(([no, sh]) => (
                    <div key={no} className="border rounded p-3 text-sm">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="font-mono font-semibold">{no}</span>
                        <span>{new Date(sh.shippedAt).toLocaleString("zh-CN")}</span>
                        <span>{sh.carrier}{sh.trackingNo ? ` · ${sh.trackingNo}` : ""}</span>
                        <span className="text-xs text-muted-foreground">
                          {sh.freightPayType === "COD" ? "到付" : sh.freightPayType === "MONTHLY" ? "月结" : "寄付"}
                          {sh.fromType === "OUTSOURCER" ? " · 外协直发" : ""}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{sh.items.join("；")}</div>
                      {sh.note && <div className="text-xs text-muted-foreground mt-0.5">备注：{sh.note}</div>}
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
}
