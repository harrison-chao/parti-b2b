import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate } from "@/lib/utils";
import { PRINT_CSS, PRINT_SCRIPT } from "@/lib/print-utils";
import { surfaceCodesText } from "@/lib/surface";

export const dynamic = "force-dynamic";

const FREIGHT_LABEL: Record<string, string> = { PREPAID: "寄付", COD: "到付", MONTHLY: "月结" };

/**
 * 送货单（链路外部单证·发货环节）：随货流转给客户，含签收回执联。
 * 合发支持：一单多订单，按订单分节展示；数量按 ShipmentLine 实发数量。
 */
export default async function DeliveryPrintPage({ params }: { params: { shipmentNo: string } }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "DEALER") redirect("/");

  const shipment = await prisma.shipment.findUnique({
    where: { shipmentNo: params.shipmentNo },
    include: {
      lines: {
        orderBy: { orderNo: "asc" },
        include: { line: true, order: { include: { dealer: true } } },
      },
    },
  });
  if (!shipment) notFound();

  const byOrder = new Map<string, typeof shipment.lines>();
  for (const sl of shipment.lines) {
    const g = byOrder.get(sl.orderNo) ?? ([] as typeof shipment.lines);
    g.push(sl);
    byOrder.set(sl.orderNo, g);
  }
  const firstOrder = shipment.lines[0]?.order;
  const totalQty = shipment.lines.reduce((s, l) => s + l.quantity, 0);
  const today = new Date();

  const lineDesc = (sl: (typeof shipment.lines)[number]) => {
    const l = sl.line;
    const parts = [l.productName];
    if (l.cutLengthMm) parts.push(`${l.cutLengthMm}mm`);
    const surface = surfaceCodesText(l);
    if (surface) parts.push(surface);
    return parts.join(" · ");
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <button className="print-btn" id="__print_btn">打印 / 保存 PDF</button>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />

      <div className="print-sheet">
        <h1 className="title">送 货 单</h1>
        <div className="subtitle">DELIVERY NOTE · {shipment.shipmentNo}</div>

        <div className="meta">
          <div><span className="k">发货日期：</span>{formatDate(shipment.shippedAt)}</div>
          <div><span className="k">承运商：</span>{shipment.carrier}</div>
          <div><span className="k">运单号：</span>{shipment.trackingNo ?? "-"}</div>
          <div><span className="k">运费：</span>{FREIGHT_LABEL[shipment.freightPayType] ?? shipment.freightPayType}</div>
          <div><span className="k">发货地：</span>{shipment.fromType === "OUTSOURCER" ? `外协厂直发${shipment.fromNote ? `（${shipment.fromNote}）` : ""}` : "工厂车间"}</div>
        </div>

        {firstOrder && (
          <div className="meta" style={{ marginTop: 8 }}>
            <div><span className="k">收货人：</span>{firstOrder.receiverName}</div>
            <div><span className="k">联系电话：</span>{firstOrder.receiverPhone}</div>
            <div style={{ flexBasis: "100%" }}><span className="k">收货地址：</span>{firstOrder.receiverAddress}</div>
            <div><span className="k">客户名称：</span>{firstOrder.dealer.companyName}</div>
          </div>
        )}
        {byOrder.size > 1 && (
          <div style={{ fontSize: 11, color: "#c2410c", marginTop: 4 }}>※ 本单为合发单，共 {byOrder.size} 个订单，请按订单核对。</div>
        )}

        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>订单号</th><th>行号</th><th>SKU</th><th>品名 / 规格 / 表面</th><th className="num">本次发货</th><th>单位</th>
            </tr>
          </thead>
          <tbody>
            {[...byOrder.entries()].map(([orderNo, lines]) =>
              lines.map((sl, i) => (
                <tr key={sl.id}>
                  <td>{i === 0 ? (sl.order.displayOrderNo ?? orderNo) : ""}</td>
                  <td className="num">{sl.line.lineNo}</td>
                  <td style={{ fontFamily: "monospace" }}>{sl.line.sku}</td>
                  <td>{lineDesc(sl)}</td>
                  <td className="num">{sl.quantity}</td>
                  <td>件/支</td>
                </tr>
              )),
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="num">合计</td>
              <td className="num">{totalQty}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div style={{ display: "flex", gap: 40, marginTop: 24, fontSize: 12 }}>
          <div>发货人：______________</div>
          <div>制单日期：{formatDate(today)}</div>
        </div>
      </div>

      {/* 第二联：签收回执（分页打印，随货带回或拍照回传） */}
      <div className="print-sheet" style={{ pageBreakBefore: "always" }}>
        <h1 className="title">签 收 回 执 联</h1>
        <div className="subtitle">RECEIPT · {shipment.shipmentNo}</div>

        <div className="meta">
          <div><span className="k">对应送货单：</span>{shipment.shipmentNo}</div>
          <div><span className="k">发货日期：</span>{formatDate(shipment.shippedAt)}</div>
          <div><span className="k">收货客户：</span>{firstOrder?.dealer.companyName ?? "-"}</div>
          <div><span className="k">合计件数：</span>{totalQty} 件/支（共 {byOrder.size} 个订单）</div>
        </div>

        <p style={{ fontSize: 12, lineHeight: 1.8, marginTop: 12 }}>
          本单位已收到上述送货单所列货物，经当场清点，数量与送货单一致、外包装完好。
          如有品种、数量或外观异议，应当场提出并于收货后 3 个工作日内书面提出，逾期视为验收合格。
        </p>

        <table style={{ marginTop: 12, fontSize: 12 }}>
          <thead>
            <tr><th>订单号</th><th>件数</th><th>验收无误 ✓</th><th>异议说明</th></tr>
          </thead>
          <tbody>
            {[...byOrder.entries()].map(([orderNo, lines]) => (
              <tr key={orderNo}>
                <td>{lines[0].order.displayOrderNo ?? orderNo}</td>
                <td className="num">{lines.reduce((s, l) => s + l.quantity, 0)}</td>
                <td style={{ height: 26 }}>□</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 48, marginTop: 36, fontSize: 12 }}>
          <div>收货人签字：______________</div>
          <div>收货日期：______年____月____日</div>
          <div>盖章（可选）：______________</div>
        </div>
        <p style={{ fontSize: 11, color: "#666", marginTop: 16 }}>
          请将本联签字后交回送货人员或拍照回传，作为对账与尾款结算依据。
        </p>
      </div>
    </>
  );
}
