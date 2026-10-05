import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getSupplierStatementDetail } from "@/lib/reconcile";
import { formatMoney, formatDate, PURCHASE_ORDER_STATUS_LABEL } from "@/lib/utils";
import { numToChinese, PRINT_CSS, PRINT_SCRIPT } from "@/lib/print-utils";
import { roleHome } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** 供应商对账单（链路外部单证·采购对账环节）：应付订单明细 + 付款记录 + 余额；按重量结算行金额=结算单价×实收磅重 */
export default async function SupplierStatementPrintPage({ params }: { params: { supplierId: string } }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect(roleHome(session.user.role));

  const data = await getSupplierStatementDetail(params.supplierId);
  if (!data) notFound();
  const { supplier, pos, payments, payable, paid, balance } = data;

  const today = new Date();
  const balanceNum = Number(balance);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <button className="print-btn" id="__print_btn">打印 / 保存 PDF</button>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />

      <div className="print-sheet">
        <h1 className="title">供 应 商 对 账 单</h1>
        <div className="subtitle">SUPPLIER STATEMENT · {supplier.supplierNo}</div>

        <div className="meta">
          <div><span className="k">供应商名称：</span>{supplier.name}</div>
          <div><span className="k">供应商编号：</span>{supplier.supplierNo}</div>
          <div><span className="k">制单日期：</span>{formatDate(today)}</div>
          <div><span className="k">对账期间：</span>全部往来</div>
        </div>

        <h3 style={{ marginTop: 16 }}>一、采购/应付明细</h3>
        <table>
          <thead>
            <tr>
              <th>采购单号</th><th>下单日期</th><th>状态</th><th>目标车间</th>
              <th className="num">下单金额</th><th className="num">已收应付</th><th className="num">已付</th><th className="num">未付余额</th>
            </tr>
          </thead>
          <tbody>
            {pos.map((r) => (
              <tr key={r.poNo}>
                <td>{r.poNo}</td>
                <td>{formatDate(r.orderDate)}</td>
                <td>{PURCHASE_ORDER_STATUS_LABEL[r.status as keyof typeof PURCHASE_ORDER_STATUS_LABEL] ?? r.status}</td>
                <td>{r.workshopName}</td>
                <td className="num">{formatMoney(r.orderedAmount)}</td>
                <td className="num">{formatMoney(r.receivedAmount)}</td>
                <td className="num">{formatMoney(r.paidAmount)}</td>
                <td className="num">{formatMoney(r.unpaidAmount)}</td>
              </tr>
            ))}
            {pos.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", color: "#666" }}>本期无采购单</td></tr>
            )}
          </tbody>
        </table>

        <h3 style={{ marginTop: 16 }}>二、付款记录</h3>
        <table>
          <thead>
            <tr><th>付款日期</th><th>金额</th><th>方式</th><th>备注</th></tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.paidAt)}</td>
                <td className="num">{formatMoney(Number(p.amount))}</td>
                <td>{p.method ?? "-"}</td>
                <td>{p.refNo ?? p.note ?? "-"}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: "center", color: "#666" }}>暂无付款记录</td></tr>
            )}
          </tbody>
        </table>

        <div style={{ marginTop: 16, fontSize: 13, textAlign: "right", lineHeight: 2 }}>
          <div>应付合计：{formatMoney(payable)}</div>
          <div>已付合计：{formatMoney(paid)}</div>
          <div style={{ fontWeight: 700 }}>{balanceNum >= 0 ? `应付未付余额：${formatMoney(balance)}` : `多付/预付余额：${formatMoney(Math.abs(balanceNum))}`}</div>
          <div style={{ fontSize: 12 }}>大写：{numToChinese(Math.abs(balanceNum))}</div>
        </div>

        <p style={{ fontSize: 11, color: "#666", marginTop: 12 }}>
          说明：按重量结算的采购行，应付金额 = 结算单价 × 实收磅重（以双方确认磅单为准）。请核对无误后盖章回传，作为付款结算依据。
        </p>

        <div style={{ display: "flex", gap: 48, marginTop: 36, fontSize: 12 }}>
          <div>供方确认（盖章）：______________</div>
          <div>需方（我方）：______________</div>
          <div>日期：______年____月____日</div>
        </div>
      </div>
    </>
  );
}
