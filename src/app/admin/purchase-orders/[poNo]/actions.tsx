"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";

type Line = {
  id: string;
  lineNo: number;
  sku: string;
  productName: string;
  spec: string | null;
  quantity: number;
  receivedQty: number;
  unitPrice: number;
  lineAmount: number;
};

export function PODetailActions({ poNo, status, lines, totalAmount }: { poNo: string; status: string; lines: Line[]; totalAmount: number }) {
  const router = useRouter();
  const [receiveInput, setReceiveInput] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, 0])),
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canEdit = status === "DRAFT";
  const canReceive = ["SENT", "PARTIALLY_RECEIVED", "DRAFT"].includes(status);

  async function markSent() {
    setBusy(true);
    await fetch(`/api/purchase-orders/${poNo}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SENT" }),
    });
    setBusy(false);
    router.refresh();
  }

  async function cancel() {
    if (!confirm("确认取消该采购单？已收货的不可取消。")) return;
    setBusy(true);
    const r = await fetch(`/api/purchase-orders/${poNo}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.code !== 0) { setError(j.message); return; }
    router.refresh();
  }

  async function receive() {
    setError("");
    const payload = lines
      .map((l) => ({ lineId: l.id, receiveQty: receiveInput[l.id] || 0 }))
      .filter((l) => l.receiveQty > 0);
    if (payload.length === 0) { setError("请填写至少一行的本次收货数量"); return; }
    setBusy(true);
    const r = await fetch(`/api/purchase-orders/${poNo}/receive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: payload, note: note || null }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.code !== 0) { setError(j.message); return; }
    setNote("");
    setReceiveInput(Object.fromEntries(lines.map((l) => [l.id, 0])));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>采购明细</CardTitle>
          <div className="flex gap-2">
            {status === "DRAFT" && <Button size="sm" variant="outline" onClick={markSent} disabled={busy}>标记已下单</Button>}
            {status !== "CANCELLED" && status !== "RECEIVED" && status !== "CLOSED" && (
              <Button size="sm" variant="outline" onClick={cancel} disabled={busy}>取消</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b"><tr className="text-left">
            <th className="p-3">#</th><th className="p-3">SKU</th>
            <th className="p-3">名称</th>
            <th className="p-3 text-right">订货</th>
            <th className="p-3 text-right">已收</th>
            <th className="p-3 text-right">剩余</th>
            <th className="p-3 text-right">单价</th>
            <th className="p-3 text-right">小计</th>
            {canReceive && <th className="p-3 text-right">本次收货</th>}
          </tr></thead>
          <tbody>
            {lines.map((l) => {
              const remaining = l.quantity - l.receivedQty;
              return (
                <tr key={l.id} className="border-b">
                  <td className="p-3">{l.lineNo}</td>
                  <td className="p-3 font-mono text-xs">{l.sku}</td>
                  <td className="p-3">
                    <div>{l.productName}</div>
                    {l.spec && <div className="text-xs text-muted-foreground">{l.spec}</div>}
                  </td>
                  <td className="p-3 text-right">{l.quantity}</td>
                  <td className="p-3 text-right">{l.receivedQty}</td>
                  <td className={`p-3 text-right ${remaining > 0 ? "text-amber-700" : "text-muted-foreground"}`}>{remaining}</td>
                  <td className="p-3 text-right">{formatMoney(l.unitPrice)}</td>
                  <td className="p-3 text-right font-medium">{formatMoney(l.lineAmount)}</td>
                  {canReceive && (
                    <td className="p-3 text-right">
                      {remaining > 0 ? (
                        <Input type="number" min={0} max={remaining} value={receiveInput[l.id] || 0}
                          onChange={(e) => setReceiveInput({ ...receiveInput, [l.id]: parseInt(e.target.value) || 0 })}
                          className="w-20 text-right" />
                      ) : <span className="text-xs text-muted-foreground">已收齐</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50">
            <tr><td colSpan={7} className="p-3 text-right font-semibold">合计</td>
              <td className="p-3 text-right font-bold text-emerald-700 text-lg">{formatMoney(totalAmount)}</td>
              {canReceive && <td></td>}
            </tr>
          </tfoot>
        </table>

        {canReceive && (
          <div className="p-4 border-t bg-slate-50/50 flex items-center gap-3">
            <Input placeholder="收货备注（可选）" value={note} onChange={(e) => setNote(e.target.value)} className="flex-1" />
            <Button onClick={receive} disabled={busy}>{busy ? "处理中..." : "确认收货入库"}</Button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
