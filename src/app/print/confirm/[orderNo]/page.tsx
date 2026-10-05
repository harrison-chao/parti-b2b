import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate } from "@/lib/utils";
import { numToChinese, PRINT_CSS, PRINT_SCRIPT } from "@/lib/print-utils";
import { surfaceCodesText } from "@/lib/surface";
import { loadSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * 销售订单确认书（链路外部单证·接单环节）：客户下单后的合同性确认，
 * 载明明细/金额/交期/条款，双方各执一份；加盖合同章后与报价单配套流转。
 */
export default async function OrderConfirmPrintPage({ params }: { params: { orderNo: string } }) {
  const session = await auth();
  if (!session) redirect("/login");

  const order = await prisma.salesOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: {
      dealer: true,
      lines: { orderBy: { lineNo: "asc" } },
      workOrder: { select: { committedDeliveryDate: true } },
    },
  });
  if (!order) notFound();
  if (session.user.role === "DEALER") {
    if (order.dealerId !== session.user.dealerId) notFound();
    // 未过审草稿不外发盖章确认书（防拿草稿约束终端客户后再改单）
    if (["DRAFT", "MODIFYING"].includes(order.orderStatus)) notFound();
  }
  if (session.user.role === "WORKSHOP") redirect("/workshop");

  const dealer = order.dealer;
  const settings = await loadSettings();
  const stamp = settings.stampTemplate;

  const amount = Number(order.confirmedAmount ?? order.totalAmount);
  const deliveryDate = order.workOrder?.committedDeliveryDate ?? order.targetDeliveryDate;
  const today = new Date();

  const lineDesc = (l: (typeof order.lines)[number]) => {
    const parts: string[] = [];
    if (l.cutLengthMm) parts.push(`切长 ${l.cutLengthMm}mm`);
    const surface = surfaceCodesText(l);
    if (surface) parts.push(surface);
    if (l.processCodes?.length) parts.push(`工序 ${l.processCodes.join("/")}`);
    return parts.join(" · ") || "-";
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <button className="print-btn" id="__print_btn">打印 / 保存 PDF</button>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />

      <div className="print-sheet">
        <h1 className="title">销 售 订 单 确 认 书</h1>
        <div className="subtitle">SALES ORDER CONFIRMATION · {order.displayOrderNo ?? order.orderNo}</div>

        <div className="meta">
          <div><span className="k">订单编号：</span>{order.displayOrderNo ?? order.orderNo}</div>
          <div><span className="k">下单日期：</span>{formatDate(order.orderDate)}</div>
          <div><span className="k">确认交期：</span>{formatDate(deliveryDate)}</div>
          <div><span className="k">客户名称：</span>{dealer.customerType === "WALK_IN" ? (dealer.nickname || dealer.companyName) : dealer.companyName}</div>
          <div><span className="k">联系人：</span>{order.receiverName}（{order.receiverPhone}）</div>
          <div style={{ flexBasis: "100%" }}><span className="k">收货地址：</span>{order.receiverAddress}</div>
        </div>

        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>行号</th><th>SKU</th><th>品名</th><th>规格 / 表面 / 工序</th>
              <th className="num">数量</th><th className="num">单价</th><th className="num">小计</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.id}>
                <td className="num">{l.lineNo}</td>
                <td style={{ fontFamily: "monospace" }}>{l.sku}</td>
                <td>{l.productName}</td>
                <td>{lineDesc(l)}</td>
                <td className="num">{l.quantity}</td>
                <td className="num">{formatMoney(Number(l.unitPrice))}</td>
                <td className="num">{formatMoney(Number(l.lineAmount))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="num">订单金额（含税）</td>
              <td className="num">{formatMoney(amount)}</td>
            </tr>
          </tfoot>
        </table>

        <p style={{ fontSize: 12, marginTop: 8 }}>金额大写：{numToChinese(amount)}</p>

        <h3 style={{ marginTop: 14 }}>条款</h3>
        <ol style={{ fontSize: 12, lineHeight: 1.9, paddingLeft: 18 }}>
          <li>交货：按确认交期交付至上述收货地址；不可抗力或客户变更需求时双方另行协商。</li>
          <li>验收：定制型材按双方确认的规格与表面处理执行；外观/数量异议于收货后 3 个工作日内书面提出，逾期视为验收合格（以签收回执联为准）。</li>
          <li>付款：按双方约定之付款方式执行；预付款订单以到账后排产，货款结清前货物所有权归供方。</li>
          <li>图纸：定制行以客户确认的图纸为准，图纸一经投产不得变更；因图纸原因产生的损失由客户提供方承担。</li>
          <li>违约与争议：任一方违约按实际损失赔偿；协商不成提交供方所在地人民法院诉讼。</li>
          {order.remark && <li>备注：{order.remark}</li>}
        </ol>

        <div className="signatures" style={{ display: "flex", justifyContent: "space-between", marginTop: 48, fontSize: 12 }}>
          <div>
            <div>需方（客户）：______________</div>
            <div style={{ marginTop: 8 }}>签字/盖章：</div>
            <div style={{ marginTop: 8 }}>日期：______年____月____日</div>
          </div>
          <div style={{ position: "relative", textAlign: "right" }}>
            <div>供方：{stamp?.companyName ?? "（请在系统设置中填写公司名称）"}</div>
            <div style={{ marginTop: 8 }}>签字/盖章：</div>
            {stamp?.url && <img src={stamp.url} alt="合同章" className="stamp" />}
            <div style={{ marginTop: 8 }}>日期：{formatDate(today)}</div>
          </div>
        </div>
      </div>
    </>
  );
}
