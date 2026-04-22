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

type ProductRow = {
  sku: string;
  productName: string;
  series: string;
  spec: string;
  lengthMm: string;
  retailPrice: string;
  purchasePrice: string;
  unit: string;
  drawingRequired: boolean;
  isRawMaterial: boolean;
  yieldRate: string;
};

const emptyRow = (category: "HARDWARE" | "PROFILE"): ProductRow => ({
  sku: "",
  productName: "",
  series: "",
  spec: "",
  lengthMm: category === "PROFILE" ? "3600" : "",
  retailPrice: "",
  purchasePrice: "",
  unit: category === "PROFILE" ? "根" : "件",
  drawingRequired: false,
  isRawMaterial: category === "PROFILE",
  yieldRate: "0.95",
});

export function ProductManager({ products }: { products: P[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"HARDWARE" | "PROFILE">("HARDWARE");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<P | null>(null);
  const [bulkRows, setBulkRows] = useState<ProductRow[]>([emptyRow("HARDWARE"), emptyRow("HARDWARE"), emptyRow("HARDWARE")]);
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

  function switchTab(category: "HARDWARE" | "PROFILE") {
    setTab(category);
    setBulkRows([emptyRow(category), emptyRow(category), emptyRow(category)]);
    setCreating(false);
    setEditing(null);
    resetForm();
    setStatus("");
  }

  function resetForm() {
    setForm({ sku: "", productName: "", series: "", spec: "", lengthMm: "3600", retailPrice: "", purchasePrice: "", unit: "根", drawingRequired: false, isRawMaterial: false, yieldRate: "0.95" });
  }

  function openCreate() {
    setEditing(null);
    resetForm();
    setBulkRows([emptyRow(tab), emptyRow(tab), emptyRow(tab)]);
    setStatus("");
    setCreating((v) => !v);
  }

  function patchBulkRow(index: number, patch: Partial<ProductRow>) {
    setBulkRows((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  function addBulkRow() {
    setBulkRows((rows) => [...rows, emptyRow(tab)]);
  }

  function removeBulkRow(index: number) {
    setBulkRows((rows) => rows.length <= 1 ? rows : rows.filter((_, i) => i !== index));
  }

  function pasteBulkRows(text: string) {
    const parsed = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cols = line.split(/\t|,/).map((col) => col.trim());
        return {
          ...emptyRow(tab),
          sku: cols[0] ?? "",
          productName: cols[1] ?? "",
          series: cols[2] ?? "",
          spec: cols[3] ?? "",
          retailPrice: cols[4] ?? "",
          purchasePrice: cols[5] ?? "",
          unit: cols[6] || (tab === "PROFILE" ? "根" : "件"),
          lengthMm: cols[7] || (tab === "PROFILE" ? "3600" : ""),
          yieldRate: cols[8] || "0.95",
          drawingRequired: ["1", "true", "是", "必传"].includes((cols[9] ?? "").toLowerCase()),
          isRawMaterial: tab === "PROFILE" ? !["0", "false", "否", "非原料"].includes((cols[10] ?? "").toLowerCase()) : false,
        };
      });
    if (parsed.length > 0) setBulkRows(parsed);
  }

  async function saveBulkProducts() {
    const rows = bulkRows.filter((row) => row.sku.trim() || row.productName.trim() || row.series.trim());
    if (rows.length === 0) {
      setStatus("✗ 至少填写一行");
      return;
    }

    const invalid = rows.find((row) => !row.sku.trim() || !row.productName.trim() || !row.series.trim());
    if (invalid) {
      setStatus("✗ SKU、名称、系列为必填");
      return;
    }

    setStatus("批量保存中...");
    const r = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        products: rows.map((row) => ({
          sku: row.sku.trim(),
          productName: row.productName.trim(),
          series: row.series.trim(),
          category: tab,
          lengthMm: tab === "PROFILE" && row.lengthMm ? parseFloat(row.lengthMm) : null,
          spec: row.spec.trim() || null,
          retailPrice: parseFloat(row.retailPrice) || 0,
          purchasePrice: row.purchasePrice ? parseFloat(row.purchasePrice) : null,
          unit: row.unit.trim() || (tab === "PROFILE" ? "根" : "件"),
          drawingRequired: row.drawingRequired,
          isRawMaterial: tab === "PROFILE" ? row.isRawMaterial : false,
          yieldRate: tab === "PROFILE" ? (parseFloat(row.yieldRate) || 0.95) : 0.95,
        })),
      }),
    });
    const j = await r.json();
    if (j.code !== 0) {
      setStatus("✗ " + j.message);
      return;
    }
    setStatus(`✓ 已批量新增 ${j.data.count} 个 SKU`);
    setBulkRows([emptyRow(tab), emptyRow(tab), emptyRow(tab)]);
    setCreating(false);
    router.refresh();
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

  async function deleteProduct(p: P) {
    const confirmed = confirm(`确认删除 SKU「${p.sku}」？\n\n仅未被订单、采购、库存或流水引用的 SKU 可以删除。`);
    if (!confirmed) return;
    setStatus("删除中...");
    const r = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.code !== 0) {
      setStatus("✗ " + j.message);
      return;
    }
    setStatus(`✓ 已删除 ${p.sku}`);
    if (editing?.id === p.id) {
      setEditing(null);
      resetForm();
    }
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
            onClick={() => switchTab(c)}
            className={`px-4 py-2 rounded-md text-sm font-medium ${tab === c ? "bg-slate-900 text-white" : "bg-white border"}`}
          >
            {PRODUCT_CATEGORY_LABEL[c]} · {products.filter((p) => p.category === c).length}
          </button>
        ))}
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate}>{creating ? "取消" : "+ 新增"}</Button>
      </div>

      {creating && !editing && (
        <Card>
          <CardHeader>
            <CardTitle>批量新增 {PRODUCT_CATEGORY_LABEL[tab]} SKU</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border bg-white/60 p-3 text-xs leading-6 text-muted-foreground">
              可从 Excel 复制多行粘贴。列顺序：SKU、名称、系列、规格、零售价、采购成本、单位、原料棒长、良率、图纸必传、是否原料。
            </div>
            <textarea
              className="min-h-20 w-full rounded-xl border border-input bg-white/75 p-3 text-sm shadow-sm"
              placeholder="粘贴多行数据，例如：SKU<Tab>名称<Tab>系列<Tab>规格..."
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text.includes("\n") || text.includes("\t")) {
                  e.preventDefault();
                  pasteBulkRows(text);
                }
              }}
            />
            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="w-full min-w-[1180px] text-xs">
                <thead className="border-b bg-slate-50">
                  <tr className="text-left">
                    <th className="p-2">SKU*</th><th className="p-2">名称*</th><th className="p-2">系列*</th><th className="p-2">规格</th>
                    <th className="p-2">零售价</th><th className="p-2">采购成本</th><th className="p-2">单位</th>
                    {tab === "PROFILE" && <><th className="p-2">原料棒长</th><th className="p-2">良率</th><th className="p-2">原料</th></>}
                    <th className="p-2">图纸</th><th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-2"><Input value={row.sku} onChange={(e) => patchBulkRow(index, { sku: e.target.value })} /></td>
                      <td className="p-2"><Input value={row.productName} onChange={(e) => patchBulkRow(index, { productName: e.target.value })} /></td>
                      <td className="p-2"><Input value={row.series} onChange={(e) => patchBulkRow(index, { series: e.target.value })} /></td>
                      <td className="p-2"><Input value={row.spec} onChange={(e) => patchBulkRow(index, { spec: e.target.value })} /></td>
                      <td className="p-2"><Input type="number" value={row.retailPrice} onChange={(e) => patchBulkRow(index, { retailPrice: e.target.value })} /></td>
                      <td className="p-2"><Input type="number" value={row.purchasePrice} onChange={(e) => patchBulkRow(index, { purchasePrice: e.target.value })} /></td>
                      <td className="p-2"><Input value={row.unit} onChange={(e) => patchBulkRow(index, { unit: e.target.value })} /></td>
                      {tab === "PROFILE" && (
                        <>
                          <td className="p-2"><Input type="number" value={row.lengthMm} onChange={(e) => patchBulkRow(index, { lengthMm: e.target.value })} /></td>
                          <td className="p-2"><Input type="number" min="0.01" max="1" step="0.01" value={row.yieldRate} onChange={(e) => patchBulkRow(index, { yieldRate: e.target.value })} /></td>
                          <td className="p-2 text-center"><input type="checkbox" checked={row.isRawMaterial} onChange={(e) => patchBulkRow(index, { isRawMaterial: e.target.checked })} /></td>
                        </>
                      )}
                      <td className="p-2 text-center"><input type="checkbox" checked={row.drawingRequired} onChange={(e) => patchBulkRow(index, { drawingRequired: e.target.checked })} /></td>
                      <td className="p-2"><button className="text-red-600 hover:underline" onClick={() => removeBulkRow(index)}>删除行</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={addBulkRow}>+ 增加一行</Button>
              <Button onClick={saveBulkProducts}>批量保存</Button>
              <Button variant="outline" onClick={() => { setCreating(false); setBulkRows([emptyRow(tab), emptyRow(tab), emptyRow(tab)]); }}>取消</Button>
              {status && <span className="text-sm">{status}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {editing && (
        <Card>
          <CardHeader><CardTitle>编辑 {PRODUCT_CATEGORY_LABEL[editing.category as "HARDWARE" | "PROFILE"]} SKU</CardTitle></CardHeader>
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
                      <button onClick={() => deleteProduct(p)} className="text-xs text-red-600 hover:underline">
                        删除
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
