"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";

type Supplier = { id: string; supplierNo: string; name: string };
type Workshop = { id: string; code: string; name: string };
type Product = { id: string; sku: string; productName: string; spec: string | null; category: string; isRawMaterial: boolean; purchasePrice: number | null };

type Row = { id: string; sku: string; productName: string; spec: string | null; quantity: number; unitPrice: number };

export function NewPOForm({ suppliers, workshops, products }: { suppliers: Supplier[]; workshops: Workshop[]; products: Product[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [workshopId, setWorkshopId] = useState(workshops[0]?.id ?? "");
  const [expectedDate, setExpectedDate] = useState("");
  const [remark, setRemark] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const filtered = products.filter((p) =>
    !search || p.sku.toLowerCase().includes(search.toLowerCase()) || p.productName.toLowerCase().includes(search.toLowerCase()),
  );

  function addProduct(p: Product) {
    const existing = rows.find((r) => r.sku === p.sku);
    if (existing) {
      setRows(rows.map((r) => (r.sku === p.sku ? { ...r, quantity: r.quantity + 1 } : r)));
    } else {
      setRows([...rows, {
        id: crypto.randomUUID(),
        sku: p.sku,
        productName: p.productName,
        spec: p.spec,
        quantity: 1,
        unitPrice: p.purchasePrice ?? 0,
      }]);
    }
  }

  function patch(id: string, delta: Partial<Row>) {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...delta } : r)));
  }

  function remove(id: string) {
    setRows(rows.filter((r) => r.id !== id));
  }

  const total = rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);

  async function submit() {
    setError("");
    if (!supplierId || !workshopId) return setError("请选择供应商和车间");
    if (rows.length === 0) return setError("请至少添加一行");
    for (const r of rows) {
      if (r.quantity <= 0) return setError(`行 ${r.sku} 数量必须 > 0`);
      if (r.unitPrice < 0) return setError(`行 ${r.sku} 单价不能为负`);
    }
    setSubmitting(true);
    try {
      const resp = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          workshopId,
          expectedDate: expectedDate || null,
          remark: remark || null,
          receiverName: receiverName || null,
          receiverPhone: receiverPhone || null,
          receiverAddress: receiverAddress || null,
          lines: rows.map((r) => ({
            sku: r.sku,
            productName: r.productName,
            spec: r.spec,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
          })),
        }),
      });
      const j = await resp.json();
      if (j.code !== 0) { setError(j.message); return; }
      router.push(`/admin/purchase-orders/${j.data.poNo}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">新建采购单</h1>

      <Card>
        <CardHeader><CardTitle>基本信息</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>供应商</Label>
            <select className="w-full h-9 px-3 border rounded-md text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplierNo} · {s.name}</option>)}
            </select>
          </div>
          <div>
            <Label>目标车间</Label>
            <select className="w-full h-9 px-3 border rounded-md text-sm" value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
              {workshops.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
            </select>
          </div>
          <div>
            <Label>期望到货</Label>
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
          <div>
            <Label>备注</Label>
            <Input value={remark} onChange={(e) => setRemark(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>选择产品</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="搜索 SKU / 名称" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-[500px] overflow-y-auto space-y-1">
              {filtered.map((p) => (
                <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left p-2 rounded hover:bg-slate-100 border text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{p.sku}</span>
                    {p.isRawMaterial && <Badge className="bg-amber-100 text-amber-800 text-[10px]">原料</Badge>}
                  </div>
                  <div className="text-muted-foreground">{p.productName}</div>
                  {p.purchasePrice != null && <div className="text-muted-foreground">建议 {formatMoney(p.purchasePrice)}</div>}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>采购明细 ({rows.length} 行)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b"><tr className="text-left">
                <th className="p-3">SKU</th><th className="p-3">名称</th>
                <th className="p-3 text-right">数量</th><th className="p-3 text-right">单价</th>
                <th className="p-3 text-right">小计</th><th className="p-3"></th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="p-3 font-mono text-xs">{r.sku}</td>
                    <td className="p-3">
                      <div>{r.productName}</div>
                      {r.spec && <div className="text-xs text-muted-foreground">{r.spec}</div>}
                    </td>
                    <td className="p-3 text-right">
                      <Input type="number" min={1} value={r.quantity} onChange={(e) => patch(r.id, { quantity: parseInt(e.target.value) || 0 })} className="w-20 text-right" />
                    </td>
                    <td className="p-3 text-right">
                      <Input type="number" step="0.01" min={0} value={r.unitPrice} onChange={(e) => patch(r.id, { unitPrice: parseFloat(e.target.value) || 0 })} className="w-24 text-right" />
                    </td>
                    <td className="p-3 text-right font-medium">{formatMoney(r.quantity * r.unitPrice)}</td>
                    <td className="p-3"><button onClick={() => remove(r.id)} className="text-xs text-red-600 hover:underline">删除</button></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">左侧选择产品添加</td></tr>}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-slate-50">
                  <tr><td colSpan={4} className="p-3 text-right font-semibold">合计</td>
                    <td className="p-3 text-right font-bold text-emerald-700 text-lg">{formatMoney(total)}</td><td></td></tr>
                </tfoot>
              )}
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>收货仓库</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>收货联系人</Label>
            <Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="如 仓库主管 张师傅" />
          </div>
          <div>
            <Label>联系电话</Label>
            <Input value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} placeholder="如 13800000000" />
          </div>
          <div className="md:col-span-3">
            <Label>收货地址</Label>
            <Input value={receiverAddress} onChange={(e) => setReceiverAddress(e.target.value)} placeholder="省市区 + 详细地址" />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={submitting || rows.length === 0}>{submitting ? "提交中..." : "保存为草稿"}</Button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
