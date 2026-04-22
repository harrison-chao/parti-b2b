import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate } from "@/lib/utils";
import { numToChinese, PRINT_CSS, PRINT_SCRIPT } from "@/lib/print-utils";

export const dynamic = "force-dynamic";

export default async function QuotePrintPage({ params }: { params: { orderNo: string } }) {
  const session = await auth();
  if (!session) redirect("/login");

  const order = await prisma.salesOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: { dealer: true, lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!order) notFound();

  // Only the owning dealer (or admin) can view
  if (session.user.role === "DEALER" && order.dealerId !== session.user.dealerId) notFound();
  if (session.user.role === "WORKSHOP") redirect("/workshop");

  const dealer = order.dealer;

  // Quote math: ONLY use targetPrice. Never fallback to unitPrice (that is the purchase/cost price).
  // Lines without targetPrice render as "待议" so the dealer must set one before exporting.
  const quoteLines = order.lines.map((l) => {
    const unit = l.targetPrice != null ? Number(l.targetPrice) : null;
    const amount = unit != null ? unit * l.quantity : null;
    return { ...l, quoteUnit: unit, quoteAmount: amount };
  });
  const quoteTotal = quoteLines.reduce<number>((s, l) => s + (l.quoteAmount ?? 0), 0);
  const hasMissing = quoteLines.some((l) => l.quoteUnit == null);

  const today = new Date();
  const validUntil = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <button className="print-btn" id="__print_btn">打印 / 保存 PDF</button>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />

      <div className="print-sheet">
        <h1 className="title">产 品 报 价 单</h1>
        <div className="subtitle">QUOTATION · {order.orderNo}</div>
        {hasMissing && (
          <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", color: "#92400e", padding: "8px 12px", marginBottom: 12, fontSize: 12, borderRadius: 4 }}>
            ⚠ 本单存在未填目标价的明细行（显示为"待议"），合计金额仅为已填行之和。导出给客户前请在报价工作台补齐目标价。
          </div>
        )}

        <div className="meta">
          <div><span className="k">报价单号：</span>{order.orderNo}</div>
          <div><span className="k">报价日期：</span>{formatDate(today)}</div>
          <div><span className="k">有效期至：</span>{formatDate(validUntil)}</div>
          <div><span className="k">期望交期：</span>{formatDate(order.targetDeliveryDate)}</div>
        </div>

        <div className="party">
          <h3>报价方</h3>
          <div className="row"><span className="k">公司名称：</span><span>{dealer.companyName}</span></div>
          <div className="row"><span className="k">经销商编号：</span><span>{dealer.dealerNo}</span></div>
          {dealer.contactName && (
            <div className="row"><span className="k">联系人：</span><span>{dealer.contactName}{dealer.contactPhone ? " · " + dealer.contactPhone : ""}</span></div>
          )}
          {dealer.region && (
            <div className="row"><span className="k">所在地区：</span><span>{dealer.region}</span></div>
          )}
        </div>

        <div className="party">
          <h3>客户（收货方）</h3>
          <div className="row"><span className="k">客户名称：</span><span>{order.receiverName}</span></div>
          <div className="row"><span className="k">联系电话：</span><span>{order.receiverPhone}</span></div>
          <div className="row"><span className="k">收货地址：</span><span>{order.receiverAddress}</span></div>
          {order.remark && (
            <div className="row"><span className="k">项目备注：</span><span>{order.remark}</span></div>
          )}
        </div>

        <h3 style={{ fontSize: 13, margin: "12px 0 6px" }}>报价明细</h3>
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>产品名称 / 规格</th>
              <th style={{ width: 120 }}>加工 / 说明</th>
              <th style={{ width: 60 }}>数量</th>
              <th style={{ width: 84 }}>单价 (¥)</th>
              <th style={{ width: 96 }}>金额 (¥)</th>
            </tr>
          </thead>
          <tbody>
            {quoteLines.map((l) => (
              <tr key={l.id}>
                <td className="center">{l.lineNo}</td>
                <td>
                  <div>{l.productName}{l.spec ? ` · ${l.spec}` : ""}</div>
                  {l.surfaceTreatment && <div style={{ fontSize: 11, color: "#666" }}>表面处理：{l.surfaceTreatment}</div>}
                </td>
                <td style={{ fontSize: 11 }}>{l.preprocessing || "—"}</td>
                <td className="num">{l.quantity}</td>
                <td className="num">{l.quoteUnit != null ? formatMoney(l.quoteUnit) : "待议"}</td>
                <td className="num">{l.quoteAmount != null ? formatMoney(l.quoteAmount) : "待议"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="num">合计金额</td>
              <td className="num">¥ {formatMoney(quoteTotal)}</td>
            </tr>
            <tr>
              <td colSpan={2}>大写金额</td>
              <td colSpan={4}>{numToChinese(quoteTotal)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="terms">
          <h3>报价条款</h3>
          <ol>
            <li>报价有效期：自报价日起 30 日内有效，超期请重新确认。</li>
            <li>价格说明：以上单价为人民币含税价（13% 增值税专用发票），已含标准包装费。</li>
            <li>交付方式：送货至客户指定地址，运费在总价内含（超远距离另行协商）；到货后请在 3 个工作日内完成验收。</li>
            <li>质量标准：产品须符合国家标准及双方确认的技术规范，如有质量问题由报价方负责换货或退款。</li>
            <li>结算要求：签订订单时预付 30% 定金，发货前付清余款；具体付款方式以双方合同约定为准。</li>
            <li>生产周期：以双方确认的期望交期为准，如因客户变更设计导致延期，交期顺延。</li>
            <li>违约责任：任一方逾期履行本报价单约定，逾期部分按日 0.3% 计算违约金。</li>
            <li>争议解决：履行过程中发生争议，协商解决；协商不成提交报价方所在地人民法院诉讼。</li>
          </ol>
        </div>

        <div className="signatures">
          <div className="sign-box">
            <h4>报价方（盖章）</h4>
            <div>报价日期：{formatDate(today)}</div>
            {dealer.stampUrl && <img src={dealer.stampUrl} alt="经销商合同章" className="stamp" />}
          </div>
          <div className="sign-box">
            <h4>客户确认（签字 / 盖章）</h4>
            <div>确认日期：____年____月____日</div>
          </div>
        </div>
      </div>
    </>
  );
}
