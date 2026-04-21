"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Line = { id: string; sku: string; productName: string; systemQty: number; actualQty: number; diff: number };

export function StockCountEditor({ countNo, status, lines: initial }: { countNo: string; status: string; lines: Line[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(initial);
  const [busy, setBusy] = useState(false);
  const [status1, setStatus1] = useState("");
  const editable = status === "DRAFT";

  function patch(id: string, actual: number) {
    setLines(lines.map((l) => (l.id === id ? { ...l, actualQty: actual, diff: actual - l.systemQty } : l)));
  }

  async function save() {
    setBusy(true); setStatus1("保存中...");
    const r = await fetch(`/api/stock-counts/${countNo}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: lines.map((l) => ({ id: l.id, actualQty: l.actualQty })) }),
    });
    const j = await r.json();
    setBusy(false);
    if (j.code !== 0) { setStatus1("✗ " + j.message); return; }
    setStatus1("✓ 已保存");
    router.refresh();
  }

  async function submit() {
    if (!confirm("提交后盘点单将进入管理员审核，审核前不会调整库存。确认提交？")) return;
    await save();
    setBusy(true); setStatus1("提交中...");
    const r = await fetch(`/api/stock-counts/${countNo}/submit`, { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (j.code !== 0) { setStatus1("✗ " + j.message); return; }
    router.refresh();
  }

  const totalDiff = lines.reduce((s, l) => s + Math.abs(l.diff), 0);
  const positive = lines.filter((l) => l.diff > 0).length;
  const negative = lines.filter((l) => l.diff < 0).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>明细（{lines.length} 项 · 盈 {positive} · 亏 {negative} · 差异绝对值合计 {totalDiff}）</CardTitle>
          {editable && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={save} disabled={busy}>保存草稿</Button>
              <Button size="sm" onClick={submit} disabled={busy}>提交审核</Button>
              {status1 && <span className="text-xs">{status1}</span>}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b"><tr className="text-left">
            <th className="p-3">SKU</th><th className="p-3">名称</th>
            <th className="p-3 text-right">系统</th>
            <th className="p-3 text-right">实盘</th>
            <th className="p-3 text-right">差异</th>
          </tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b">
                <td className="p-3 font-mono text-xs">{l.sku}</td>
                <td className="p-3">{l.productName}</td>
                <td className="p-3 text-right">{l.systemQty}</td>
                <td className="p-3 text-right">
                  {editable ? (
                    <Input type="number" value={l.actualQty}
                      onChange={(e) => patch(l.id, parseInt(e.target.value) || 0)}
                      className="w-24 text-right" />
                  ) : l.actualQty}
                </td>
                <td className={`p-3 text-right font-medium ${l.diff > 0 ? "text-emerald-700" : l.diff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                  {l.diff > 0 ? "+" : ""}{l.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
