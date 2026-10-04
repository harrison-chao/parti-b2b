import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDealerStatementDetail } from "@/lib/reconcile";
import { formatMoney, formatDate, ORDER_STATUS_LABEL } from "@/lib/utils";
import { numToChinese, PRINT_CSS, PRINT_SCRIPT } from "@/lib/print-utils";

export const dynamic = "force-dynamic";

/** 客户对账单（ADMIN 专用）：应收订单明细 + 收款记录 + 余额与大写金额 */
export default async function StatementPrintPage({ params }: { params: { dealerId: string } }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  const detail = await getDealerStatementDetail(params.dealerId);
  if (!detail) notFound();
  const { dealer, orders, payments } = detail;

  const rows = orders.map((o) => {
    const receivable = Number(o.confirmedAmount ?? o.totalAmount);
    const paid = Number(o.paidAmount);
    return {
      orderNo: o.displayOrderNo ?? o.orderNo,
      orderDate: o.orderDate,
      status: o.orderStatus,
      qty: o.lines.reduce((s, l) => s + l.quantity, 0),
      receivable,
      paid,
      due: receivable - paid,
    };
  });
  const totalReceivable = rows.reduce((s, r) => s + r.receivable, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const balance = Number(detail.balance);
  const isAdvance = balance < 0;

  const today = new Date();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <button className="print-btn" id="__print_btn">打印 / 保存 PDF</button>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />

      <div className="print-sheet">
        <h1 className="title">客 户 对 账 单</h1>
        <div className="subtitle">STATEMENT · {dealer.dealerNo}</div>

        <div className="meta">
          <div><span className="k">客户名称：</span>{dealer.customerType === "WALK_IN" ? (dealer.nickname || dealer.companyName) : dealer.companyName}</div>
          <div><span className="k">客户编号：</span>{dealer.dealerNo}</div>
          <div><span className="k">制单日期：</span>{formatDate(today)}</div>
          <div><span className="k">对账期间：</span>全部往来</div>
        </div>

        <h3 style={{ marginTop: 16 }}>一、应收订单明细</h3>
        <table>
          <thead>
            <tr>
              <th>单号</th><th>下单日期</th><th>状态</th><th className="num">件数</th>
              <th className="num">应收金额</th><th className="num">已核销</th><th className="num">未收余额</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.orderNo}>
                <td>{r.orderNo}</td>
                <td>{formatDate(r.orderDate)}</td>
                <td>{ORDER_STATUS_LABEL[r.status as keyof typeof ORDER_STATUS_LABEL] ?? r.status}</td>
                <td className="num">{r.qty}</td>
                <td className="num">{formatMoney(r.receivable)}</td>
                <td className="num">{formatMoney(r.paid)}</td>
                <td className="num">{formatMoney(r.due)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "#666" }}>本期无应收订单</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ marginTop: 8, textAlign: "right", fontSize: 13 }}>
          应收合计 <b>{formatMoney(totalReceivable)}</b> · 已核销合计 <b>{formatMoney(totalPaid)}</b>
        </div>

        <h3 style={{ marginTop: 16 }}>二、收款记录</h3>
        <table>
          <thead>
            <tr><th>收款日期</th><th>方式</th><th>流水号</th><th>核销订单</th><th className="num">金额</th></tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.paidAt)}</td>
                <td>{p.method ?? "-"}</td>
                <td>{p.refNo ?? "-"}</td>
                <td>{p.allocations.length ? p.allocations.map((a) => a.orderNo).join("、") : "按时间顺序核销"}</td>
                <td className="num">{formatMoney(Number(p.amount))}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "#666" }}>暂无收款记录</td></tr>
            )}
          </tbody>
        </table>

        <div className="total" style={{ marginTop: 20, fontSize: 15 }}>
          {isAdvance ? "预收余额（客户多付）" : "未收余额"}：<b>{formatMoney(Math.abs(balance))}</b>
          <span style={{ marginLeft: 12, fontSize: 13 }}>（{isAdvance ? "负余额表示预收" : "人民币"} {numToChinese(Math.abs(balance))}）</span>
        </div>

        <div className="sign" style={{ marginTop: 40, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <div>制表：边缘智造</div>
          <div>客户确认（签字/盖章）：____________________</div>
        </div>

        <style>{`
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
        `}</style>
      </div>
    </>
  );
}
