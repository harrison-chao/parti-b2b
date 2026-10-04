"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

/**
 * 发货登记（W3）：多单合发 / 行级部分数量 / 到付 / 外协厂直发。
 * 车间端与运营端共用（≤2 点按完成一次登记）。
 */

type PendingLine = { lineId: string; lineNo: number; sku: string; productName: string; quantity: number; shipped: number; remaining: number };
type PendingOrder = {
  workOrderNo: string; orderNo: string; displayOrderNo?: string | null; orderStatus: string; woStatus: string;
  customer: string; receiverName: string; receiverPhone: string; receiverAddress: string;
  committedDeliveryDate: string | null; allowDirectFromOutsourcer: boolean; lines: PendingLine[];
};
type Sel = { orderNo: string; lineId: string; quantity: number };

const j = async (res: Response) => (await res.json()).data;

export function ShipmentForm() {
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [sel, setSel] = useState<Sel[]>([]);
  const [carrier, setCarrier] = useState("顺丰速运");
  const [trackingNo, setTrackingNo] = useState("");
  const [freightPayType, setFreightPayType] = useState<"PREPAID" | "COD" | "MONTHLY">("PREPAID");
  const [fromType, setFromType] = useState<"FACTORY" | "OUTSOURCER">("FACTORY");
  const [fromNote, setFromNote] = useState("");
  const [note, setNote] = useState("");
  const [carriers, setCarriers] = useState<string[]>(["顺丰速运", "德邦物流", "京东物流", "中通快运", "安能物流", "自提"]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await j(await fetch("/api/shipments/pending"));
    setPending(d.pending ?? []);
    try {
      const st = await j(await fetch("/api/settings"));
      if (st.carriers?.length) setCarriers(st.carriers);
    } catch { /* settings 可选 */ }
  }
  useEffect(() => { load().catch((e) => setErr(String(e))); }, []);

  function toggleLine(o: PendingOrder, l: PendingLine) {
    setSel((s) => {
      const hit = s.find((x) => x.lineId === l.lineId);
      if (hit) return s.filter((x) => x.lineId !== l.lineId);
      return [...s, { orderNo: o.orderNo, lineId: l.lineId, quantity: l.remaining }];
    });
  }
  function setQty(l: PendingLine, v: string) {
    const n = Math.max(0, Math.min(l.remaining, parseInt(v || "0", 10) || 0));
    setSel((s) => s.map((x) => (x.lineId === l.lineId ? { ...x, quantity: n } : x)));
  }
  const hasSel = (lineId: string) => sel.some((x) => x.lineId === lineId);
  const selQty = (lineId: string) => sel.find((x) => x.lineId === lineId)?.quantity ?? 0;

  async function submit() {
    setErr(null); setMsg(null);
    if (!sel.length) return setErr("请勾选要发货的行");
    if (sel.some((s) => s.quantity <= 0)) return setErr("存在数量为 0 的发货行");
    // 外协直发只能勾允许直发的订单
    if (fromType === "OUTSOURCER") {
      const notAllowed = sel.filter((s) => !pending.find((o) => o.orderNo === s.orderNo)?.allowDirectFromOutsourcer);
      if (notAllowed.length) return setErr("外协直发仅适用于工单仍在加工/外协中的订单（待发货单请按工厂发货）");
    } else {
      const notReady = sel.filter((s) => !["READY_TO_SHIP", "PACKING"].includes(pending.find((o) => o.orderNo === s.orderNo)?.woStatus ?? ""));
      if (notReady.length) return setErr("所选订单工单尚未到待发货状态（外协直发请切换发货地）");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrier, trackingNo: trackingNo || null, freightPayType, fromType,
          fromNote: fromNote || null, note: note || null, lines: sel,
        }),
      });
      const rj = await res.json();
      if (!rj.ok) { toast.error(rj.message ?? "发货登记失败"); return setErr(rj.message ?? "发货登记失败"); }
      setMsg(`发货单 ${rj.data.shipmentNo} 已登记（${sel.length} 行）`);
      toast.success(`发货单 ${rj.data.shipmentNo} 已登记`);
      setSel([]); setTrackingNo(""); setNote("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4 stagger-in">
      <h1 className="text-xl font-bold">发货登记</h1>
      {err && <div className="bg-destructive/10 border border-red-200 text-red-400 rounded p-3 text-sm">{err}</div>}
      {msg && <div className="bg-emerald-500/10 border border-emerald-200 text-emerald-300 rounded p-3 text-sm">{msg}</div>}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">① 勾选发货行（可跨订单合发）</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pending.map((o) => (
            <div key={o.orderNo} className="border rounded p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-bold">{o.displayOrderNo ?? o.orderNo}</span>
                <span className="text-muted-foreground">{o.customer} → {o.receiverName}</span>
                <Badge className={o.woStatus === "READY_TO_SHIP" ? "bg-cyan-100 text-cyan-700" : "bg-amber-100 text-amber-300"}>
                  {o.woStatus === "READY_TO_SHIP" ? "待发货" : o.woStatus === "PACKING" ? "打包中" : "外协/加工中(仅外协直发)"}
                </Badge>
                {o.committedDeliveryDate && <span className="text-xs text-muted-foreground">交期 {new Date(o.committedDeliveryDate).toLocaleDateString()}</span>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{o.receiverAddress} · {o.receiverPhone}</div>
              <div className="mt-2 space-y-1">
                {o.lines.map((l) => (
                  <div key={l.lineId} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={hasSel(l.lineId)} onChange={() => toggleLine(o, l)} />
                    <span className="flex-1 truncate">{l.sku} · {l.productName}</span>
                    <span className="text-xs text-muted-foreground">已发{l.shipped}/共{l.quantity}</span>
                    {hasSel(l.lineId) && (
                      <Input className="w-20 h-8" type="number" value={selQty(l.lineId)}
                        onChange={(e) => setQty(l, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!pending.length && <div className="text-sm text-muted-foreground">当前没有可发货的行（工单需推进到待发货，或已全部发出）。</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">② 物流信息</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-3">
          <div>
            <Label>承运商</Label>
            <select className="w-full border rounded p-2 text-sm" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
              {carriers.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><Label>运单号</Label><Input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="SF…" /></div>
          <div>
            <Label>运费</Label>
            <select className="w-full border rounded p-2 text-sm" value={freightPayType} onChange={(e) => setFreightPayType(e.target.value as any)}>
              <option value="PREPAID">寄付</option>
              <option value="COD">到付</option>
              <option value="MONTHLY">月结</option>
            </select>
          </div>
          <div>
            <Label>发货地</Label>
            <select className="w-full border rounded p-2 text-sm" value={fromType} onChange={(e) => setFromType(e.target.value as any)}>
              <option value="FACTORY">车间</option>
              <option value="OUTSOURCER">外协厂直发</option>
            </select>
          </div>
          {fromType === "OUTSOURCER" && <div><Label>外协厂</Label><Input value={fromNote} onChange={(e) => setFromNote(e.target.value)} placeholder="如：氧化厂" /></div>}
          <div className="md:col-span-3"><Label>备注</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：同27号订单一起发" /></div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-8">
        <Button disabled={busy} onClick={submit}>{busy ? "登记中…" : `登记发货（${sel.length} 行）`}</Button>
      </div>
    </div>
  );
}
