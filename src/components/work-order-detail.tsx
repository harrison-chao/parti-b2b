"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { surfaceCodesText } from "@/lib/surface";
import {
  formatDate, formatDateTime,
  WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR, WORK_ORDER_STATUS_FLOW,
} from "@/lib/utils";

export type WorkOrderDetailData = {
  workOrderNo: string;
  status: string;
  qcRequired: boolean;
  committedDeliveryDate: string | null;
  actualShippedAt: string | null;
  carrier: string | null;
  trackingNo: string | null;
  currentNote: string | null;
  delayReason: string | null;
  assignedBy: string | null;
  assignedAt: string;
  createdAt: string;
  printedAt: string | null;
  workshop: { code: string; name: string };
  order: {
    orderNo: string;
    orderDate: string;
    targetDeliveryDate: string;
    receiverName: string;
    receiverPhone: string;
    receiverAddress: string;
    remark: string | null;
    dealer?: { companyName: string; dealerNo: string } | null;
    lines: Array<{
      lineNo: number;
      productName: string;
      sku: string;
      quantity: number;
      preprocessing: string | null;
      surfaceTreatment: string | null;
      drawingUrl: string | null;
      drawingFileName: string | null;
    }>;
  };
  events: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    operatorName: string | null;
    createdAt: string;
  }>;
};

export function WorkOrderDetail({
  data,
  role,
  carriers,
  printHref,
  backHref,
}: {
  data: WorkOrderDetailData;
  role: "ADMIN" | "WORKSHOP";
  carriers: string[];
  printHref: string;
  backHref: string;
}) {
  const router = useRouter();
  const flow: string[] = data.qcRequired ? WORK_ORDER_STATUS_FLOW : WORK_ORDER_STATUS_FLOW.filter((s) => s !== "QC");
  const currentIdx = flow.indexOf(data.status);
  const nextStatus = currentIdx >= 0 && currentIdx < flow.length - 1 ? flow[currentIdx + 1] : null;

  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState(data.carrier ?? carriers[0] ?? "");
  const [carrierCustom, setCarrierCustom] = useState("");
  const [trackingNo, setTrackingNo] = useState(data.trackingNo ?? "");
  const [delayReason, setDelayReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [committedDate, setCommittedDate] = useState(
    data.committedDeliveryDate ? data.committedDeliveryDate.slice(0, 10) : ""
  );

  async function advance() {
    setError(""); setLoading(true);
    try {
      const isShipping = nextStatus === "SHIPPED";
      const resolvedCarrier = carrier === "__custom__" ? carrierCustom.trim() : carrier;
      if (isShipping && (!resolvedCarrier || !trackingNo.trim())) {
        setError("出运需填写物流公司和运单号"); return;
      }
      const r = await fetch(`/api/work-orders/${data.workOrderNo}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advance: true,
          note: note || null,
          carrier: isShipping ? resolvedCarrier : undefined,
          trackingNo: isShipping ? trackingNo.trim() : undefined,
          delayReason: delayReason || undefined,
        }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      setNote(""); setDelayReason("");
      router.refresh();
    } finally { setLoading(false); }
  }

  async function saveMeta() {
    setError(""); setLoading(true);
    try {
      const r = await fetch(`/api/work-orders/${data.workOrderNo}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          committedDeliveryDate: committedDate || null,
          currentNote: note || undefined,
        }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      router.refresh();
    } finally { setLoading(false); }
  }

  const overdue = data.committedDeliveryDate && data.status !== "SHIPPED" && new Date(data.committedDeliveryDate) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href={backHref} className="hover:underline">← 返回列表</Link>
          </div>
          <h1 className="text-2xl font-bold font-mono">{data.workOrderNo}</h1>
          <p className="text-sm text-muted-foreground">
            车间 {data.workshop.code} · {data.workshop.name}
            {role === "ADMIN" && (
              <> · 销售订单 <Link href={`/admin/orders/${data.order.orderNo}`} className="text-sky-400 hover:underline font-mono">{data.order.orderNo}</Link></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overdue && <Badge className="bg-red-500/15 text-red-400 ring-1 ring-inset ring-red-400/20">⚠ 已延期</Badge>}
          <Badge className={WORK_ORDER_STATUS_COLOR[data.status] + " text-base px-3 py-1"}>{WORK_ORDER_STATUS_LABEL[data.status]}</Badge>
          <a href={printHref} target="_blank" rel="noopener">
            <Button variant="outline">🖨 打印加工单</Button>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>加工进度</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 flex-wrap">
                {flow.map((s, i) => {
                  const done = i <= currentIdx;
                  const current = i === currentIdx;
                  return (
                    <div key={s} className="flex items-center gap-1">
                      <div className={`px-2 py-1 rounded text-xs ${
                        current ? "bg-indigo-600 text-white font-semibold" :
                        done ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20" :
                        "bg-secondary text-slate-400"
                      }`}>
                        {WORK_ORDER_STATUS_LABEL[s]}
                      </div>
                      {i < flow.length - 1 && <span className="text-slate-300">→</span>}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>订单明细</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-muted/50 border-b"><tr className="text-left">
                  <th className="p-3">#</th><th className="p-3">产品</th>
                  <th className="p-3">SKU</th><th className="p-3">表面</th>
                  <th className="p-3">加工</th><th className="p-3 text-right">数量</th>
                  <th className="p-3">图纸</th>
                </tr></thead>
                <tbody>
                  {data.order.lines.map((l) => (
                    <tr key={l.lineNo} className="border-b">
                      <td className="p-3">{l.lineNo}</td>
                      <td className="p-3">{l.productName}</td>
                      <td className="p-3 font-mono text-xs">{l.sku}</td>
                      <td className="p-3 text-xs">{surfaceCodesText(l) ?? l.surfaceTreatment ?? "-"}</td>
                      <td className="p-3 text-xs">{l.preprocessing ?? "-"}</td>
                      <td className="p-3 text-right">{l.quantity}</td>
                      <td className="p-3 text-xs">
                        {l.drawingUrl ? (
                          <a href={l.drawingUrl} target="_blank" rel="noopener" className="text-sky-400 hover:underline">📎 {l.drawingFileName ?? "查看"}</a>
                        ) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </CardContent>
          </Card>

          <MaterialReturnCard workOrderNo={data.workOrderNo} status={data.status} />

          <Card>
            <CardHeader><CardTitle>操作日志</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.events.map((e) => (
                  <div key={e.id} className="flex gap-3 text-sm border-l-2 border-indigo-200 pl-3 py-1">
                    <div className="text-xs text-muted-foreground w-36 shrink-0">{formatDateTime(e.createdAt)}</div>
                    <div className="flex-1">
                      <span className="text-muted-foreground">{e.fromStatus ? WORK_ORDER_STATUS_LABEL[e.fromStatus] + " → " : "派单 → "}</span>
                      <span className="font-semibold">{WORK_ORDER_STATUS_LABEL[e.toStatus]}</span>
                      {e.operatorName && <span className="text-xs text-muted-foreground ml-2">by {e.operatorName}</span>}
                      {e.note && <div className="text-xs text-muted-foreground mt-1">{e.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>收货信息</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {role === "ADMIN" && data.order.dealer && (
                <div className="pb-2 border-b">
                  <div className="text-muted-foreground text-xs">经销商</div>
                  <div>{data.order.dealer.companyName}</div>
                  <div className="text-xs font-mono">{data.order.dealer.dealerNo}</div>
                </div>
              )}
              <div><span className="text-muted-foreground">收货人：</span>{data.order.receiverName}</div>
              <div><span className="text-muted-foreground">电话：</span>{data.order.receiverPhone}</div>
              <div><span className="text-muted-foreground">地址：</span>{data.order.receiverAddress}</div>
              {data.order.remark && <div className="pt-2 border-t text-xs"><span className="text-muted-foreground">客户备注：</span>{data.order.remark}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>加工信息</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">派单人：</span>{data.assignedBy ?? "-"}</div>
              <div><span className="text-muted-foreground">派单时间：</span>{formatDateTime(data.assignedAt)}</div>
              <div><span className="text-muted-foreground">期望交期：</span>{formatDate(data.order.targetDeliveryDate)}</div>
              <div className="pt-2 border-t">
                <Label>承诺交付日期</Label>
                <Input type="date" value={committedDate} onChange={(e) => setCommittedDate(e.target.value)} />
              </div>
              {data.actualShippedAt && <div><span className="text-muted-foreground">实际出运：</span>{formatDateTime(data.actualShippedAt)}</div>}
              {data.carrier && <div><span className="text-muted-foreground">物流：</span>{data.carrier} · {data.trackingNo}</div>}
              {data.currentNote && <div className="pt-2 border-t text-xs text-muted-foreground">备注：{data.currentNote}</div>}
              {data.delayReason && <div className="text-xs text-red-400">延期原因：{data.delayReason}</div>}
            </CardContent>
          </Card>

          {nextStatus && (
            <Card>
              <CardHeader>
                <CardTitle>推进到下一状态</CardTitle>
                <p className="text-xs text-muted-foreground">{WORK_ORDER_STATUS_LABEL[data.status]} → <span className="font-semibold text-indigo-700">{WORK_ORDER_STATUS_LABEL[nextStatus]}</span></p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div><Label>操作备注（可选）</Label><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
                {nextStatus === "SHIPPED" && (
                  <>
                    <div>
                      <Label>物流公司</Label>
                      <select className="border rounded h-10 px-2 text-sm w-full" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                        {carriers.map((c) => <option key={c} value={c}>{c}</option>)}
                        <option value="__custom__">其他（手动输入）</option>
                      </select>
                      {carrier === "__custom__" && <Input className="mt-2" placeholder="物流公司名称" value={carrierCustom} onChange={(e) => setCarrierCustom(e.target.value)} />}
                    </div>
                    <div><Label>运单号</Label><Input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} /></div>
                  </>
                )}
                {overdue && (
                  <div><Label>延期原因（已逾期，必填）</Label><Textarea rows={2} value={delayReason} onChange={(e) => setDelayReason(e.target.value)} /></div>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading} onClick={advance}>
                  {loading ? "提交中..." : `推进到「${WORK_ORDER_STATUS_LABEL[nextStatus]}」`}
                </Button>
                <Button variant="outline" className="w-full" disabled={loading} onClick={saveMeta}>仅保存承诺交期/备注</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}


// ── 余料回库：切割剩余段按 SEMI 入库（账实闭环的关键一环）──────────
function MaterialReturnCard({ workOrderNo, status }: { workOrderNo: string; status: string }) {
  const [data, setData] = useState<{
    suggestions: Array<{ sourceSku: string; productName: string; barMm: number; totalCutMm: number; barsConsumed: number; remainderMm: number; maxReturnMm: number }>;
    history: Array<{ id: string; sku: string; quantity: number; note: string | null; createdAt: string }>;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [rows, setRows] = useState<Array<{ sourceSku: string; segmentMm: string; quantity: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const canReturn = ["PROCESSING", "QC", "PACKING", "READY_TO_SHIP", "SHIPPED"].includes(status);

  async function load() {
    setErr("");
    const r = await fetch(`/api/work-orders/${workOrderNo}/material-return`);
    const j = await r.json();
    if (j.code !== 0) { setErr(j.message); setLoaded(true); return; }
    setData(j.data);
    setLoaded(true);
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workOrderNo]);

  function prefill() {
    if (!data) return;
    setRows(data.suggestions
      .filter((sg) => sg.remainderMm >= 300)
      .map((sg) => ({ sourceSku: sg.sourceSku, segmentMm: String(sg.remainderMm), quantity: "1" })));
  }

  async function submit() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const payload = {
        returns: rows
          .filter((r) => r.sourceSku && r.segmentMm && Number(r.quantity) > 0)
          .map((r) => ({ sourceSku: r.sourceSku, segmentMm: Math.round(Number(r.segmentMm)), quantity: Math.round(Number(r.quantity)) })),
      };
      if (payload.returns.length === 0) { setErr("请至少填写一行余段"); return; }
      const r = await fetch(`/api/work-orders/${workOrderNo}/material-return`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.code !== 0) { setErr(j.message); return; }
      setMsg(`已回库：${j.data.created.map((c: any) => `${c.sku} ×${c.quantity}`).join("、")}`);
      setRows([]);
      void load(); // 重载建议与历史
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>余料回库（切割剩余段 → 半成品库存）</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          整棒扣料后剩余的段料在这里回库，账实才能对齐；段长 ≥ 300mm 建议回库，更短的按损耗处理。回库段自动生成/复用 SEMI 半成品档案，可再用于短切长订单。
          {!canReturn && <span className="text-amber-300"> 当前工单状态尚未领料，回库需在加工之后。</span>}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {err && <div className="text-xs text-red-400">{err}</div>}
        {data && data.suggestions.length > 0 && (
          <div className="text-xs">
            <div className="font-semibold mb-1">理论余量（扣棒数×棒长 − 切长合计）</div>
            {data.suggestions.map((sg) => (
              <div key={sg.sourceSku} className="text-muted-foreground">
                {sg.sourceSku}：扣 {sg.barsConsumed} 根 × {sg.barMm}mm − 切长 {sg.totalCutMm}mm = 余 {sg.remainderMm}mm
              </div>
            ))}
            <Button size="sm" variant="outline" className="mt-2" onClick={prefill} disabled={!canReturn}>按理论余量预填</Button>
          </div>
        )}
        {loaded && data && data.suggestions.length === 0 && (
          <div className="text-xs text-muted-foreground">本单无整棒原料行（纯半成品段/五金单），无余段可回。</div>
        )}
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select className="h-8 border rounded px-2 text-sm bg-card" value={row.sourceSku}
              onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, sourceSku: e.target.value } : r))}>
              <option value="">选择源原料</option>
              {(data?.suggestions ?? []).map((sg) => <option key={sg.sourceSku} value={sg.sourceSku}>{sg.sourceSku}</option>)}
            </select>
            <Input type="number" className="h-8 w-28" placeholder="段长 mm" value={row.segmentMm}
              onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, segmentMm: e.target.value } : r))} />
            <Input type="number" className="h-8 w-20" placeholder="根数" value={row.quantity}
              onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r))} />
            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => setRows(rows.filter((_, j) => j !== i))}>移除</Button>
          </div>
        ))}
        <div className="flex gap-2 items-center">
          <Button size="sm" variant="outline" onClick={() => setRows([...rows, { sourceSku: "", segmentMm: "", quantity: "1" }])} disabled={!canReturn}>+ 加一段</Button>
          <Button size="sm" onClick={submit} disabled={busy || !canReturn}>{busy ? "回库中..." : "确认回库"}</Button>
          {msg && <span className="text-xs text-emerald-300">{msg}</span>}
        </div>
        {data && data.history.length > 0 && (
          <div className="text-xs border-t pt-2">
            <div className="font-semibold mb-1">已回库记录</div>
            {data.history.map((h) => (
              <div key={h.id} className="text-muted-foreground">
                {new Date(h.createdAt).toLocaleString("zh-CN")} · {h.sku} ×{h.quantity} {h.note ?? ""}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
