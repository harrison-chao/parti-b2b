"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR, formatDate, formatDateTime } from "@/lib/utils";

type Workshop = { id: string; code: string; name: string };
type WorkOrderView = {
  workOrderNo: string;
  status: string;
  workshopName: string;
  committedDeliveryDate: string | null;
  committedOverrideReason: string | null;
  actualShippedAt: string | null;
  carrier: string | null;
  trackingNo: string | null;
  qcRequired: boolean;
  currentNote: string | null;
  delayReason: string | null;
  assignedBy: string | null;
  assignedAt: string;
};
type DeliveryInsight = {
  suggestedDate: string;
  suggestedDays: number;
  basis: string;
  inProduction: number;
  dueIn7d: number;
  weeklyThroughput: number;
};

export function DispatchPanel({
  orderNo,
  targetDeliveryDate,
  workshops,
  existing,
  insight,
}: {
  orderNo: string;
  targetDeliveryDate: string;
  workshops: Workshop[];
  existing: WorkOrderView | null;
  insight: DeliveryInsight | null;
}) {
  const router = useRouter();
  const [workshopId, setWorkshopId] = useState(workshops[0]?.id ?? "");
  const [committedDate, setCommittedDate] = useState(
    insight && new Date(insight.suggestedDate) > new Date(targetDeliveryDate)
      ? insight.suggestedDate.slice(0, 10)
      : targetDeliveryDate.slice(0, 10),
  );
  const [qcRequired, setQcRequired] = useState(true);
  const [note, setNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [shortageForce, setShortageForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tooEarly = insight ? committedDate < insight.suggestedDate.slice(0, 10) : false;

  async function dispatch() {
    setError(""); setLoading(true);
    try {
      const r = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNo, workshopId, committedDeliveryDate: committedDate, qcRequired, note,
          overrideReason: overrideReason || undefined,
          force: shortageForce || undefined,
        }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      router.refresh();
    } finally { setLoading(false); }
  }

  if (existing) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>加工单</CardTitle>
          <Badge className={WORK_ORDER_STATUS_COLOR[existing.status as keyof typeof WORK_ORDER_STATUS_COLOR]}>{WORK_ORDER_STATUS_LABEL[existing.status as keyof typeof WORK_ORDER_STATUS_LABEL] ?? existing.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">加工单号</span><Link href={`/admin/work-orders/${existing.workOrderNo}`} className="font-mono text-sky-400 hover:underline">{existing.workOrderNo}</Link></div>
          <div className="flex justify-between"><span className="text-muted-foreground">承诺交期</span><span>{existing.committedDeliveryDate ? formatDate(existing.committedDeliveryDate) : "-"}</span></div>
          {existing.committedOverrideReason && (
            <div className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-300">提前原因：{existing.committedOverrideReason}</div>
          )}
          <div className="flex justify-between"><span className="text-muted-foreground">车间</span><span>{existing.workshopName}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">派单人</span><span>{existing.assignedBy ?? "-"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">派单时间</span><span>{formatDateTime(existing.assignedAt)}</span></div>
          {existing.actualShippedAt && <div className="flex justify-between"><span className="text-muted-foreground">出运时间</span><span>{formatDateTime(existing.actualShippedAt)}</span></div>}
          {existing.carrier && <div className="flex justify-between"><span className="text-muted-foreground">物流</span><span>{existing.carrier} · {existing.trackingNo}</span></div>}
          {existing.currentNote && <div className="pt-2 border-t text-xs text-muted-foreground">{existing.currentNote}</div>}
          <div className="pt-3">
            <Link href={`/admin/work-orders/${existing.workOrderNo}`}>
              <Button variant="outline" className="w-full">查看加工进度 →</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (workshops.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>加工派单</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">尚未维护加工车间。</p>
          <Link href="/admin/workshops"><Button variant="outline" className="w-full">去创建车间</Button></Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>加工派单</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {insight && (
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3 text-xs leading-5">
            <div className="font-semibold text-cyan-300">系统建议承诺交期：{insight.suggestedDate.slice(0, 10)}（{insight.suggestedDays} 天后）</div>
            <div className="text-muted-foreground">{insight.basis}</div>
            <div className="text-muted-foreground">当前队列：在产 {insight.inProduction} 单 · 未来 7 天应交 {insight.dueIn7d} 单 · 近期周产能约 {insight.weeklyThroughput} 单</div>
          </div>
        )}
        <div>
          <Label>指定车间</Label>
          <select className="border rounded h-10 px-2 text-sm w-full" value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
            {workshops.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
        </div>
        <div><Label>承诺交付日期</Label><Input type="date" value={committedDate} onChange={(e) => setCommittedDate(e.target.value)} /></div>
        {tooEarly && (
          <div className="space-y-1.5">
            <Label className="text-amber-300">承诺早于建议值 —— 请填提前原因 *</Label>
            <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="如：客户急单已确认加急 / 已备现货" />
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <input type="checkbox" id="qc" checked={qcRequired} onChange={(e) => setQcRequired(e.target.checked)} />
          <label htmlFor="qc">需要质检（QC）</label>
        </div>
        <div>
          <Label>派单备注（可选）</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="mt-0.5" checked={shortageForce} onChange={(e) => setShortageForce(e.target.checked)} />
          缺料放行（库存不足时勾选并记录缺料明细后继续派单）
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" disabled={loading || !workshopId || (tooEarly && !overrideReason.trim())} onClick={dispatch}>{loading ? "派单中..." : "🛠 一键加工派单"}</Button>
      </CardContent>
    </Card>
  );
}
