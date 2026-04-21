"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Payment = {
  id: string; amount: string; paidAt: string;
  method: string | null; refNo: string | null; note: string | null; recordedBy: string | null;
};

export function DealerPaymentPanel({ dealerId, payments }: { dealerId: string; payments: Payment[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [method, setMethod] = useState("银行转账");
  const [refNo, setRefNo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function add() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setMsg("请输入金额"); return; }
    setBusy(true); setMsg("保存中...");
    const r = await fetch("/api/dealer-payments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealerId, amount: amt, paidAt, method, refNo, note }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.code !== 0) { setMsg("✗ " + j.message); return; }
    setAmount(""); setRefNo(""); setNote(""); setMsg("✓ 已登记");
    router.refresh();
  }

  async function del(id: string) {
    if (!confirm("删除该收款记录？")) return;
    setBusy(true);
    const r = await fetch(`/api/dealer-payments/${id}`, { method: "DELETE" });
    const j = await r.json();
    setBusy(false);
    if (j.code !== 0) { setMsg("✗ " + j.message); return; }
    router.refresh();
  }

  return (
    <Card>
      <CardHeader><CardTitle>收款记录（{payments.length}）</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
          <div><label className="text-xs text-muted-foreground">金额</label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
          <div><label className="text-xs text-muted-foreground">日期</label>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
          <div><label className="text-xs text-muted-foreground">方式</label>
            <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="银行转账/微信/支付宝" /></div>
          <div><label className="text-xs text-muted-foreground">流水号</label>
            <Input value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="可选" /></div>
          <div><label className="text-xs text-muted-foreground">备注</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" /></div>
          <div className="flex items-center gap-2">
            <Button onClick={add} disabled={busy} size="sm">登记收款</Button>
            {msg && <span className="text-xs">{msg}</span>}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-y"><tr className="text-left">
            <th className="p-2">日期</th>
            <th className="p-2 text-right">金额</th>
            <th className="p-2">方式</th>
            <th className="p-2">流水号</th>
            <th className="p-2">备注</th>
            <th className="p-2">登记人</th>
            <th className="p-2 text-right">操作</th>
          </tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="p-2 text-xs">{new Date(p.paidAt).toLocaleDateString("zh-CN")}</td>
                <td className="p-2 text-right font-medium text-emerald-700">¥{Number(p.amount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                <td className="p-2">{p.method ?? "-"}</td>
                <td className="p-2 font-mono text-xs">{p.refNo ?? "-"}</td>
                <td className="p-2 text-xs text-muted-foreground">{p.note ?? "-"}</td>
                <td className="p-2 text-xs">{p.recordedBy ?? "-"}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => del(p.id)} disabled={busy} className="text-red-600">删除</Button>
                </td>
              </tr>
            ))}
            {payments.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground text-sm">暂无收款记录。</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
