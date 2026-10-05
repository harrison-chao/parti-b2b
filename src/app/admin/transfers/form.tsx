"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type WorkshopOption = {
  id: string; code: string; name: string;
  inventory: Array<{ sku: string; productName: string; quantity: number }>;
};

export function TransferForm({ workshops }: { workshops: WorkshopOption[] }) {
  const router = useRouter();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Array<{ sku: string; quantity: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const from = workshops.find((w) => w.id === fromId);
  const to = workshops.find((w) => w.id === toId);

  const suggestions = useMemo(() => from?.inventory ?? [], [from]);
  const picked = rows.filter((r) => r.sku && Number(r.quantity) > 0);

  async function submit() {
    setBusy(true); setErr(""); setMsg("");
    try {
      if (!fromId || !toId) { setErr("请选择调出仓与调入仓"); return; }
      if (fromId === toId) { setErr("调出仓与调入仓不能相同"); return; }
      if (picked.length === 0) { setErr("请至少填写一行"); return; }
      const r = await fetch("/api/transfers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromWorkshopId: fromId, toWorkshopId: toId, note: note || null,
          lines: picked.map((p) => ({ sku: p.sku, quantity: Math.round(Number(p.quantity)) })),
        }),
      });
      const j = await r.json();
      if (j.code !== 0) { setErr(j.message); return; }
      setMsg(`调拨单 ${j.data.transferNo} 已执行`);
      setRows([]); setNote("");
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>新建调拨</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">调出仓</label>
            <select className="w-full h-10 border rounded px-2 text-sm bg-card" value={fromId}
              onChange={(e) => { setFromId(e.target.value); setRows([]); }}>
              <option value="">选择调出仓</option>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">调入仓</label>
            <select className="w-full h-10 border rounded px-2 text-sm bg-card" value={toId}
              onChange={(e) => setToId(e.target.value)}>
              <option value="">选择调入仓</option>
              {workshops.filter((w) => w.id !== fromId).map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">备注（可选）</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：半成品下沉到车间" />
          </div>
        </div>

        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <select className="h-8 border rounded px-2 text-sm bg-card flex-1" value={row.sku}
              onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, sku: e.target.value } : r))}>
              <option value="">选择 SKU（调出仓现存）</option>
              {suggestions.map((s) => (
                <option key={s.sku} value={s.sku} disabled={s.quantity < (Number(rows.find((x) => x.sku === s.sku)?.quantity) || 0)}>
                  {s.sku} · {s.productName} · 现存 {s.quantity}
                </option>
              ))}
            </select>
            <Input type="number" className="h-8 w-24" placeholder="数量" value={row.quantity}
              onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r))} />
            <Button size="sm" variant="ghost" className="text-red-400" onClick={() => setRows(rows.filter((_, j) => j !== i))}>移除</Button>
          </div>
        ))}

        <div className="flex gap-2 items-center">
          <Button size="sm" variant="outline" onClick={() => setRows([...rows, { sku: "", quantity: "" }])} disabled={!fromId}>+ 加一行</Button>
          <Button size="sm" onClick={submit} disabled={busy || !fromId || !toId}>{busy ? "执行中..." : "执行调拨"}</Button>
          {msg && <span className="text-xs text-emerald-300">{msg}</span>}
          {err && <span className="text-xs text-red-400">{err}</span>}
          {from && to && <span className="text-xs text-muted-foreground">{from.name} → {to.name}，{picked.length} 行</span>}
        </div>
      </CardContent>
    </Card>
  );
}
