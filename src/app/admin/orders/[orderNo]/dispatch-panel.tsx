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
  actualShippedAt: string | null;
  carrier: string | null;
  trackingNo: string | null;
  qcRequired: boolean;
  currentNote: string | null;
  delayReason: string | null;
  assignedBy: string | null;
  assignedAt: string;
};

export function DispatchPanel({
  orderNo,
  targetDeliveryDate,
  workshops,
  existing,
}: {
  orderNo: string;
  targetDeliveryDate: string;
  workshops: Workshop[];
  existing: WorkOrderView | null;
}) {
  const router = useRouter();
  const [workshopId, setWorkshopId] = useState(workshops[0]?.id ?? "");
  const [committedDate, setCommittedDate] = useState(targetDeliveryDate.slice(0, 10));
  const [qcRequired, setQcRequired] = useState(true);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function dispatch() {
    setError(""); setLoading(true);
    try {
      const r = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo, workshopId, committedDeliveryDate: committedDate, qcRequired, note }),
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
          <Badge className={WORK_ORDER_STATUS_COLOR[existing.status]}>{WORK_ORDER_STATUS_LABEL[existing.status]}</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">加工单号</span><Link href={`/admin/work-orders/${existing.workOrderNo}`} className="font-mono text-blue-600 hover:underline">{existing.workOrderNo}</Link></div>
          <div className="flex justify-between"><span className="text-muted-foreground">承诺交期</span><span>{existing.committedDeliveryDate ? formatDate(existing.committedDeliveryDate) : "-"}</span></div>
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
        <div>
          <Label>指定车间</Label>
          <select className="border rounded h-10 px-2 text-sm w-full" value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
            {workshops.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
        </div>
        <div><Label>承诺交付日期</Label><Input type="date" value={committedDate} onChange={(e) => setCommittedDate(e.target.value)} /></div>
        <div className="flex items-center gap-2 text-sm">
          <input type="checkbox" id="qc" checked={qcRequired} onChange={(e) => setQcRequired(e.target.checked)} />
          <label htmlFor="qc">需要质检（QC）</label>
        </div>
        <div><Label>派单备注（可选）</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={loading || !workshopId} onClick={dispatch}>{loading ? "派单中..." : "🛠 一键加工派单"}</Button>
      </CardContent>
    </Card>
  );
}
