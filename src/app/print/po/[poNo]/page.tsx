import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings";
import { formatMoney, formatDate } from "@/lib/utils";
import { numToChinese, PRINT_CSS, PRINT_SCRIPT } from "@/lib/print-utils";

export const dynamic = "force-dynamic";

export default async function POPrintPage({ params }: { params: { poNo: string } }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dealer");

  const po = await prisma.purchaseOrder.findUnique({
    where: { poNo: params.poNo },
    include: { supplier: true, workshop: true, lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!po) notFound();

  const settings = await loadSettings();
  const stamp = settings.stampTemplate;
  const totalAmount = Number(po.totalAmount);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <button className="print-btn" id="__print_btn">打印 / 保存 PDF</button>
      <script dangerouslySetInnerHTML={{ __html: PRINT_SCRIPT }} />

      <div className="print-sheet">
        <h1 className="title">采 购 合 同</h1>
        <div className="subtitle">PURCHASE ORDER · {po.poNo}</div>

        <div className="meta">
          <div><span className="k">合同编号：</span>{po.poNo}</div>
          <div><span className="k">下单日期：</span>{formatDate(po.orderDate)}</div>
          <div><span className="k">期望到货：</span>{po.expectedDate ? formatDate(po.expectedDate) : "—"}</div>
          <div><span className="k">制单人：</span>{po.createdBy ?? "—"}</div>
        </div>

        <div className="party">
          <h3>甲方（采购方）</h3>
          <div className="row"><span className="k">公司名称：</span><span>{stamp?.companyName ?? "（请在系统设置中上传合同章并填写公司名称）"}</span></div>
          <div className="row"><span className="k">收货车间：</span><span>{po.workshop.code} · {po.workshop.name}</span></div>
          {(po.receiverName || po.receiverPhone) && (
            <div className="row">
              <span className="k">收货联系人：</span>
              <span>{po.receiverName ?? "—"}{po.receiverPhone ? " · " + po.receiverPhone : ""}</span>
            </div>
          )}
          {po.receiverAddress && (
            <div className="row"><span className="k">收货地址：</span><span>{po.receiverAddress}</span></div>
          )}
        </div>

        <div className="party">
          <h3>乙方（供应方）</h3>
          <div className="row"><span className="k">供应商：</span><span>{po.supplier.supplierNo} · {po.supplier.name}</span></div>
          {po.supplier.contactName && (
            <div className="row"><span className="k">联系人：</span><span>{po.supplier.contactName}{po.supplier.contactPhone ? " · " + po.supplier.contactPhone : ""}</span></div>
          )}
          {po.supplier.address && (
            <div className="row"><span className="k">地址：</span><span>{po.supplier.address}</span></div>
          )}
          {po.supplier.taxNo && (
            <div className="row"><span className="k">税号：</span><span>{po.supplier.taxNo}</span></div>
          )}
        </div>

        <h3 style={{ fontSize: 13, margin: "12px 0 6px" }}>采购明细</h3>
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th style={{ width: 120 }}>物料编码</th>
              <th>物料名称 / 规格</th>
              <th style={{ width: 60 }}>数量</th>
              <th style={{ width: 80 }}>单价 (¥)</th>
              <th style={{ width: 96 }}>金额 (¥)</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => (
              <tr key={l.id}>
                <td className="center">{l.lineNo}</td>
                <td style={{ fontFamily: "monospace" }}>{l.sku}</td>
                <td>{l.productName}{l.spec ? ` · ${l.spec}` : ""}</td>
                <td className="num">{l.quantity}</td>
                <td className="num">{formatMoney(Number(l.unitPrice))}</td>
                <td className="num">{formatMoney(Number(l.lineAmount))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="num">合计金额</td>
              <td className="num">¥ {formatMoney(totalAmount)}</td>
            </tr>
            <tr>
              <td colSpan={2}>大写金额</td>
              <td colSpan={4}>{numToChinese(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="terms">
          <h3>交付与结算条款</h3>
          <ol>
            <li>交货方式：送货至甲方指定收货车间，运费含在总价内（另行约定除外）。</li>
            <li>质量要求：货物须符合国标及双方确认的技术规范，外观、尺寸、材质均不得有瑕疵。</li>
            <li>验收标准：甲方于到货后 3 个工作日内完成验收，不合格批次由乙方无偿换货或退款。</li>
            <li>结算方式：凭增值税专用发票（13%）以银行转账方式结清，账期以双方付款协议为准。</li>
            <li>违约责任：任一方逾期履行本合同义务，逾期部分按日 0.3% 计算违约金。</li>
            <li>争议解决：合同履行过程中发生争议协商解决；协商不成提交甲方所在地人民法院诉讼。</li>
            {po.remark && <li>备注：{po.remark}</li>}
          </ol>
        </div>

        <div className="signatures">
          <div className="sign-box">
            <h4>甲方（盖章）</h4>
            <div>签订日期：____年____月____日</div>
            {stamp?.url && <img src={stamp.url} alt="合同章" className="stamp" />}
          </div>
          <div className="sign-box">
            <h4>乙方（盖章）</h4>
            <div>签订日期：____年____月____日</div>
          </div>
        </div>
      </div>
    </>
  );
}
