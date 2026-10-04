"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Row = {
  sku: string; productName: string; spec: string | null; unitPrice: number;
  demand: number; stock: number; transit: number; gap: number;
};
type Supplier = { id: string; supplierNo: string; name: string };
type Workshop = { id: string; code: string; name: string };

export function MaterialDemandTable({ rows, suppliers, workshops, anyWorkshop }: {
  rows: Row[]; suppliers: Supplier[]; workshops: Workshop[]; anyWorkshop: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set(rows.filter((r) => r.gap > 0).map((r) => r.sku)));
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [workshopId, setWorkshopId] = useState(anyWorkshop);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const selected = rows.filter((r) => checked.has(r.sku) && r.gap > 0);
  const totalEst = selected.reduce((s, r) => s + r.gap * r.unitPrice, 0);

  function toggle(sku: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }

  async function createPoDraft() {
    if (!selected.length) { setMsg("请勾选至少一个净缺口 > 0 的行"); return; }
    if (!supplierId) { setMsg("没有可选的原料供应商，请先在供应商页建档（类别=原料）"); return; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          workshopId,
          remark: "需求汇总页一键生成（mini-MRP）",
          lines: selected.map((row) => ({
            sku: row.sku,
            productName: row.productName,
            spec: row.spec,
            quantity: row.gap,
            unitPrice: row.unitPrice,
          })),
        }),
      });
      const j = await r.json();
      if (j.code !== 0) { setMsg("✗ " + j.message); return; }
      setMsg(`✓ 已生成采购草稿 ${j.data.poNo}（${selected.length} 行），请到采购单确认下发`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-card/40"><tr className="text-left">
              <th className="p-3"></th>
              <th className="p-3">原料</th><th className="p-3">规格</th>
              <th className="p-3 text-right">需求（棒/件）</th>
              <th className="p-3 text-right">车间现存</th>
              <th className="p-3 text-right">在途采购</th>
              <th className="p-3 text-right">净缺口</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sku} className="border-b">
                  <td className="p-3">
                    <input type="checkbox" checked={checked.has(r.sku)} onChange={() => toggle(r.sku)} disabled={r.gap <= 0} />
                  </td>
                  <td className="p-3">
                    <div className="font-semibold">{r.productName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.sku}</div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{r.spec ?? "-"}</td>
                  <td className="p-3 text-right">{r.demand}</td>
                  <td className="p-3 text-right">{r.stock}</td>
                  <td className="p-3 text-right text-sky-300">{r.transit}</td>
                  <td className={`p-3 text-right font-bold ${r.gap > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                    {r.gap > 0 ? r.gap : "✓"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">当前没有在制工单用料需求。</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t p-4">
          <select className="h-10 rounded-xl border border-input bg-card/75 px-3 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.length === 0 && <option value="">（无原料供应商）</option>}
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplierNo} · {s.name}</option>)}
          </select>
          <select className="h-10 rounded-xl border border-input bg-card/75 px-3 text-sm" value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
            {workshops.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
          <Button onClick={createPoDraft} disabled={busy || !selected.length}>
            {busy ? "生成中..." : `生成采购草稿（${selected.length} 行）`}
          </Button>
          {selected.length > 0 && (
            <span className="text-xs text-muted-foreground">预估金额 ¥{totalEst.toFixed(2)}（按产品档案采购价）</span>
          )}
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
