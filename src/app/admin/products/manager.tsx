"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney, PRODUCT_CATEGORY_LABEL } from "@/lib/utils";

type P = {
  id: string;
  sku: string;
  productName: string;
  series: string;
  category: string;
  lengthMm: number | null;
  spec: string | null;
  retailPrice: number;
  purchasePrice: number | null;
  unit: string;
  drawingRequired: boolean;
  isRawMaterial: boolean;
  yieldRate: number;
  isActive: boolean;
};

export function ProductManager({ products }: { products: P[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"HARDWARE" | "PROFILE">("HARDWARE");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<P | null>(null);
  const [form, setForm] = useState({
    sku: "",
    productName: "",
    series: "",
    spec: "",
    lengthMm: "3600",
    retailPrice: "",
    purchasePrice: "",
    unit: "根",
    drawingRequired: false,
    isRawMaterial: false,
    yieldRate: "0.95",
  });
  const [status, setStatus] = useState("");

  const list = products.filter((p) => p.category === tab);

  function resetForm() {
    setForm({ sku: "", productName: "", series: "", spec: "", lengthMm: "3600", retailPrice: "", purchasePrice: "", unit: "根", drawingRequired: false, isRawMaterial: false, yieldRate: "0.95" });
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setStatus("");
    setCreating((v) => !v);
  }

  function openEdit(product: P) {
    setTab(product.category as "HARDWARE" | "PROFILE");
    setCreating(false);
    setEditing(product);
    setStatus("");
    setForm({
      sku: product.sku,
      productName: product.productName,
      series: product.series,
      spec: product.spec ?? "",
      lengthMm: product.lengthMm != null ? String(product.lengthMm) : "3600",
      retailPrice: String(product.retailPrice),
      purchasePrice: product.purchasePrice != null ? String(product.purchasePrice) : "",
      unit: product.unit,
      drawingRequired: product.drawingRequired,
      isRawMaterial: product.isRawMaterial,
      yieldRate: String(product.yieldRate ?? 0.95),
    });
  }

  async function saveProduct() {
    setStatus("保存中...");
    const category = editing ? editing.category : tab;
    const r = await fetch(editing ? `/api/products/${editing.id}` : "/api/products", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(!editing ? { sku: form.sku.trim() } : {}),
        productName: form.productName.trim(),
        series: form.series.trim(),
        category,
        lengthMm: category === "PROFILE" && form.lengthMm ? parseFloat(form.lengthMm) : null,
        spec: form.spec.trim() || null,
        retailPrice: parseFloat(form.retailPrice) || 0,
        purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : null,
        unit: form.unit.trim() || "件",
        drawingRequired: form.drawingRequired,
        isRawMaterial: category === "PROFILE" ? form.isRawMaterial : false,
        yieldRate: category === "PROFILE" ? (parseFloat(form.yieldRate) || 0.95) : 0.95,
      }),
    });
    const j = await r.json();
    if (j.code !== 0) { setStatus("✗ " + j.message); return; }
    setStatus(editing ? "✓ 已保存修改" : "✓ 已新增");
    setCreating(false);
    setEditing(null);
    resetForm();
    router.refresh();
  }

  async function toggleActive(p: P) {
    await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    router.refresh();
  }

  async function editPrice(p: P) {
    const newRetail = prompt(`修改零售价（当前 ${p.retailPrice}）`, String(p.retailPrice));
    if (newRetail == null) return;
    const v = parseFloat(newRetail);
    if (isNaN(v) || v < 0) return;
    await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retailPrice: v }),
    });
    router.refresh();
  }

  async function editProfileRules(p: P) {
    const newLength = prompt(`原料棒长 mm（当前 ${p.lengthMm ?? 3600}）`, String(p.lengthMm ?? 3600));
    if (newLength == null) return;
    const lengthMm = parseFloat(newLength);
    if (isNaN(lengthMm) || lengthMm <= 0) return;
    const newYield = prompt(`良率 0-1（当前 ${p.yieldRate ?? 0.95}）`, String(p.yieldRate ?? 0.95));
    if (newYield == null) return;
    const yieldRate = parseFloat(newYield);
    if (isNaN(yieldRate) || yieldRate <= 0 || yieldRate > 1) return;
    await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lengthMm, yieldRate, isRawMaterial: true }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">产品目录</h1>
        <p className="text-sm text-muted-foreground">HARDWARE 标准零配件在此维护；PROFILE 非标型材动态生成 SKU，此处展示统计与原料母料</p>
      </div>

      <div className="flex items-center gap-2">
        {(["HARDWARE", "PROFILE"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setTab(c)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${tab === c ? "bg-slate-900 text-white" : "bg-white border"}`}
          >
            {PRODUCT_CATEGORY_LABEL[c]} · {products.filter((p) => p.category === c).length}
          </button>
        ))}
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate}>{creating ? "取消" : "+ 新增"}</Button>
      </div>

      {(creating || editing) && (
        <Card>
          <CardHeader><CardTitle>{editing ? "编辑" : "新增"} {PRODUCT_CATEGORY_LABEL[(editing?.category as "HARDWARE" | "PROFILE") ?? tab]} SKU</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><Label>SKU</Label><Input value={form.sku} disabled={!!editing} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="如 OL2525" /></div>
            <div><Label>产品名称</Label><Input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} /></div>
            <div><Label>系列</Label><Input value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} placeholder="如 六通 / 层板托" /></div>
            <div className="col-span-2"><Label>规格</Label><Input value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="如 25x25" /></div>
            {((editing?.category ?? tab) === "PROFILE") && (
              <>
                <div><Label>原料棒长(mm)</Label><Input type="number" value={form.lengthMm} onChange={(e) => setForm({ ...form, lengthMm: e.target.value })} /></div>
                <div><Label>生产良率(0-1)</Label><Input type="number" min="0.01" max="1" step="0.01" value={form.yieldRate} onChange={(e) => setForm({ ...form, yieldRate: e.target.value })} /></div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isRawMaterial} onChange={(e) => setForm({ ...form, isRawMaterial: e.target.checked })} />
                  作为原料型材参与工单扣减
                </label>
              </>
            )}
            {((editing?.category ?? tab) !== "PROFILE") && (
              <div><Label>零售价</Label><Input type="number" step="0.01" value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: e.target.value })} /></div>
            )}
            <div><Label>采购成本（可选）</Label><Input type="number" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} /></div>
            <div><Label>单位</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="根 / 件 / 套" /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.drawingRequired} onChange={(e) => setForm({ ...form, drawingRequired: e.target.checked })} />
              下单时强制上传图纸（如定制六通）
            </label>
            <div className="col-span-full flex items-center gap-3">
              <Button onClick={saveProduct}>保存</Button>
              <Button variant="outline" onClick={() => { setCreating(false); setEditing(null); resetForm(); }}>取消</Button>
              {status && <span className="text-sm">{status}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">SKU</th><th className="p-3">名称</th><th className="p-3">系列</th>
              <th className="p-3">规格</th>{tab === "PROFILE" && <th className="p-3">原料规则</th>}
              {tab !== "PROFILE" && <th className="p-3 text-right">零售价</th>}
              <th className="p-3 text-right">采购成本</th><th className="p-3">图纸</th>
              <th className="p-3">状态</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-mono">{p.sku}</td>
                  <td className="p-3">{p.productName}</td>
                  <td className="p-3 text-xs">{p.series}</td>
                  <td className="p-3 text-xs text-muted-foreground">{p.spec ?? "-"}</td>
                  {tab === "PROFILE" && (
                    <td className="p-3 text-xs">
                      {p.isRawMaterial ? (
                        <button className="text-left text-blue-600 hover:underline" onClick={() => editProfileRules(p)}>
                          原料 · {p.lengthMm ?? 3600}mm · 良率 {p.yieldRate ?? 0.95}
                        </button>
                      ) : <span className="text-muted-foreground">非原料</span>}
                    </td>
                  )}
                  {tab !== "PROFILE" && (
                    <td className="p-3 text-right cursor-pointer hover:underline" onClick={() => editPrice(p)}>
                      {formatMoney(p.retailPrice)}
                    </td>
                  )}
                  <td className="p-3 text-right text-xs text-muted-foreground">{p.purchasePrice != null ? formatMoney(p.purchasePrice) : "-"}</td>
                  <td className="p-3 text-xs">{p.drawingRequired ? "必传" : "-"}</td>
                  <td className="p-3">
                    <Badge className={p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}>
                      {p.isActive ? "启用" : "停用"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => openEdit(p)} className="text-xs text-blue-600 hover:underline">
                        编辑
                      </button>
                      <button onClick={() => toggleActive(p)} className="text-xs text-blue-600 hover:underline">
                        {p.isActive ? "停用" : "启用"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">暂无</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
