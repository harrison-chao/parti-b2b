"use client";
import type { WorkOrderDetailData } from "@/components/work-order-detail";
import { formatDate, formatDateTime, WORK_ORDER_STATUS_LABEL } from "@/lib/utils";

export function WorkOrderPrint({ data }: { data: WorkOrderDetailData }) {
  return (
    <div className="print-root bg-white text-black mx-auto" style={{ width: "210mm", padding: "14mm", fontSize: 12 }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          .no-print { display: none !important; }
        }
        .print-root table { width: 100%; border-collapse: collapse; }
        .print-root th, .print-root td { border: 1px solid #333; padding: 6px 8px; text-align: left; vertical-align: top; }
        .print-root th { background: #f3f4f6; }
        .print-root h1 { font-size: 22px; margin: 0; }
        .print-root h2 { font-size: 14px; margin: 14px 0 6px; border-bottom: 1px solid #333; padding-bottom: 2px; }
      `}</style>

      <div className="no-print mb-3 flex justify-end gap-2">
        <button onClick={() => window.print()} className="bg-indigo-600 text-white px-3 py-1 rounded text-sm">🖨 打印</button>
      </div>

      <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-3">
        <div>
          <h1>加工单 / Work Order</h1>
          <div style={{ marginTop: 4 }}>单号：<strong style={{ fontFamily: "monospace" }}>{data.workOrderNo}</strong></div>
          <div>销售单号：<span style={{ fontFamily: "monospace" }}>{data.order.orderNo}</span></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div>当前状态：<strong>{WORK_ORDER_STATUS_LABEL[data.status]}</strong></div>
          <div>打印时间：{formatDateTime(new Date())}</div>
          <div>承诺交期：<strong>{data.committedDeliveryDate ? formatDate(data.committedDeliveryDate) : "-"}</strong></div>
        </div>
      </div>

      <h2>车间 / 派单信息</h2>
      <table>
        <tbody>
          <tr>
            <th style={{ width: 100 }}>车间</th><td>{data.workshop.code} · {data.workshop.name}</td>
            <th style={{ width: 100 }}>派单人</th><td>{data.assignedBy ?? "-"}</td>
          </tr>
          <tr>
            <th>派单时间</th><td>{formatDateTime(data.assignedAt)}</td>
            <th>是否质检</th><td>{data.qcRequired ? "需要 QC" : "免质检"}</td>
          </tr>
          <tr>
            <th>下单日期</th><td>{formatDate(data.order.orderDate)}</td>
            <th>期望交期</th><td>{formatDate(data.order.targetDeliveryDate)}</td>
          </tr>
        </tbody>
      </table>

      <h2>收货信息</h2>
      <table>
        <tbody>
          <tr>
            <th style={{ width: 100 }}>收货人</th><td>{data.order.receiverName}</td>
            <th style={{ width: 100 }}>联系电话</th><td>{data.order.receiverPhone}</td>
          </tr>
          <tr>
            <th>收货地址</th><td colSpan={3}>{data.order.receiverAddress}</td>
          </tr>
          {data.order.remark && (
            <tr><th>客户备注</th><td colSpan={3}>{data.order.remark}</td></tr>
          )}
        </tbody>
      </table>

      <h2>加工明细</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th>产品名称</th>
            <th style={{ width: 120 }}>SKU</th>
            <th style={{ width: 100 }}>表面</th>
            <th>加工</th>
            <th style={{ width: 52, textAlign: "right" }}>数量</th>
            <th style={{ width: 120 }}>图纸</th>
          </tr>
        </thead>
        <tbody>
          {data.order.lines.map((l) => (
            <tr key={l.lineNo}>
              <td>{l.lineNo}</td>
              <td>{l.productName}</td>
              <td style={{ fontFamily: "monospace" }}>{l.sku}</td>
              <td>{l.surfaceTreatment ?? "-"}</td>
              <td>{l.preprocessing ?? "-"}</td>
              <td style={{ textAlign: "right" }}>{l.quantity}</td>
              <td>{l.drawingFileName ?? (l.drawingUrl ? "见附件" : "-")}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>操作记录</h2>
      <table>
        <thead><tr><th style={{ width: 140 }}>时间</th><th style={{ width: 200 }}>状态变更</th><th>备注</th><th style={{ width: 80 }}>操作人</th></tr></thead>
        <tbody>
          {data.events.map((e) => (
            <tr key={e.id}>
              <td>{formatDateTime(e.createdAt)}</td>
              <td>{e.fromStatus ? WORK_ORDER_STATUS_LABEL[e.fromStatus] : "派单"} → {WORK_ORDER_STATUS_LABEL[e.toStatus]}</td>
              <td>{e.note ?? ""}</td>
              <td>{e.operatorName ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 28, display: "flex", justifyContent: "space-between", gap: 40 }}>
        <div style={{ flex: 1, borderTop: "1px solid #333", paddingTop: 4 }}>
          <div>车间负责人签字：</div>
          <div style={{ height: 48 }}></div>
        </div>
        <div style={{ flex: 1, borderTop: "1px solid #333", paddingTop: 4 }}>
          <div>质检签字：</div>
          <div style={{ height: 48 }}></div>
        </div>
        <div style={{ flex: 1, borderTop: "1px solid #333", paddingTop: 4 }}>
          <div>出仓签字：</div>
          <div style={{ height: 48 }}></div>
        </div>
      </div>
    </div>
  );
}
