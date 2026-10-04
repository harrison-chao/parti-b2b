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
type OpenOrder = { orderNo: string; rawOrderNo: string; due: number };

export function DealerPaymentPanel({ dealerId, openOrders = [], payments }: { dealerId: string; openOrders?: OpenOrder[]; payments: Payment[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [method, setMethod] = useState("银行转账");
  const [refNo, setRefNo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // P1-E: 指定核销（可选）——不指定时维持原 FIFO 行为
  const [showAlloc, setShowAlloc] = useState(false);
  const [allocRows, setAllocRows] = useState<Array<{ orderNo: string; amount: string }>>([]);

  const specifiedTotal = allocRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  function addAllocRow() {
    const first = openOrders.find((o) => !allocRows.some((r) => r.orderNo === o.rawOrderNo));
    if (!first) return;
    setAllocRows([...allocRows, { orderNo: first.rawOrderNo, amount: "" }]);
  }

  async function add() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setMsg("请输入金额"); return; }
    if (allocRows.length && specifiedTotal > amt + 1e-9) { setMsg("✗ 指定核销合计超过收款金额"); return; }
    setBusy(true); setMsg("保存中...");
    const r = await fetch("/api/dealer-payments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dealerId, amount: amt, paidAt, method, refNo, note,
        ...(allocRows.length ? { allocations: allocRows.filter((x) => x.orderNo && parseFloat(x.amount) > 0).map((x) => ({ orderNo: x.orderNo, amount: parseFloat(x.amount) })) } : {}),
      }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.code !== 0) { setMsg("✗ " + j.message); return; }
    setAmount(""); setRefNo(""); setNote(""); setAllocRows([]); setShowAlloc(false); setMsg("✓ 已登记");
    router.refresh();
  }

  async function del(id: string) {
    if (!confirm("删除该收款记录？将回滚对应的订单核销与信用占用。")) return;
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

        <div>
          <button className="text-xs text-cyan-300 hover:underline" onClick={() => { setShowAlloc(!showAlloc); if (!showAlloc && allocRows.length === 0 && openOrders.length) addAllocRow(); }}>
            {showAlloc ? "收起指定核销 ▴" : `指定核销（可选，当前待核销订单 ${openOrders.length} 张）▾`}
          </button>
          {showAlloc && (
            <div className="mt-2 space-y-2 rounded-xl border border-input bg-card/50 p-3">
              {openOrders.length === 0 && <p className="text-xs text-muted-foreground">该客户暂无待核销订单，收款将全额计入预收。</p>}
              {allocRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    className="h-9 flex-1 rounded-lg border border-input bg-card/75 px-2 text-sm"
                    value={row.orderNo}
                    onChange={(e) => setAllocRows(allocRows.map((r, j) => (j === i ? { ...r, orderNo: e.target.value } : r)))}
                  >
                    {openOrders.map((o) => (
                      <option key={o.rawOrderNo} value={o.rawOrderNo}>{o.orderNo}（待收 ¥{o.due.toFixed(2)}）</option>
                    ))}
                  </select>
                  <Input
                    type="number" step="0.01" className="w-32" placeholder="金额"
                    value={row.amount}
                    onChange={(e) => setAllocRows(allocRows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setAllocRows(allocRows.filter((_, j) => j !== i))}>移除</Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button size="sm" variant="outline" onClick={addAllocRow} disabled={allocRows.length >= openOrders.length}>+ 指定一张</Button>
                {allocRows.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    已指定 ¥{specifiedTotal.toFixed(2)}
                    {parseFloat(amount) > 0 && specifiedTotal < parseFloat(amount) && `，剩余 ¥${(parseFloat(amount) - specifiedTotal).toFixed(2)} 按时间顺序核销`}
                    {parseFloat(amount) > 0 && specifiedTotal === parseFloat(amount) && "，全额指定"}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-y"><tr className="text-left">
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
                <td className="p-2 text-right font-medium text-emerald-300">¥{Number(p.amount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                <td className="p-2">{p.method ?? "-"}</td>
                <td className="p-2 font-mono text-xs">{p.refNo ?? "-"}</td>
                <td className="p-2 text-xs text-muted-foreground">{p.note ?? "-"}</td>
                <td className="p-2 text-xs">{p.recordedBy ?? "-"}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => del(p.id)} disabled={busy} className="text-red-400">删除</Button>
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
