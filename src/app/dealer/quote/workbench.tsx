"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatMoney, ORDER_LINE_TYPE_LABEL, ORDER_LINE_TYPE_COLOR } from "@/lib/utils";
import { genCustomSku, genCustomProductName } from "@/lib/options";
import { PRICE_TIER_LABEL } from "@/lib/pricing";

type Option = { code: string; label: string };
type Address = { id: string; receiverName: string; receiverPhone: string; fullAddress: string; isDefault: boolean };
type HardwareItem = {
  id: string; sku: string; productName: string; series: string; spec: string | null;
  retailPrice: number; dealerPrice: number; drawingRequired: boolean;
};
type RawProfileItem = {
  id: string; sku: string; productName: string; series: string; spec: string | null; lengthMm: number | null;
};
type CrmCustomerOption = {
  id: string;
  name: string;
  phone: string;
  stage: string;
  opportunities: { id: string; title: string; stage: string }[];
};

// ── 行类型 ───────────────────────────────────────────────
type ProfileRow = {
  id: string; lineType: "PROFILE";
  rawProductId: string; rawSku: string; rawSeries: string;
  lengthMm: string; processCode: string; colorCode: string; operationCode: string;
  drawingUrl: string; drawingFileName: string; drawingUploading: boolean; drawingError?: string;
  quantity: number; targetPct: string; targetPriceOverride?: string;
  unitPrice: number | null; retailPrice: number | null; loading: boolean; error?: string;
};
type HardwareRow = {
  id: string; lineType: "HARDWARE";
  productId: string; sku: string; productName: string; spec: string | null; drawingRequired: boolean;
  drawingUrl: string; drawingFileName: string; drawingUploading: boolean; drawingError?: string;
  quantity: number; targetPct: string; targetPriceOverride?: string;
  unitPrice: number; retailPrice: number;
};
type OutsourcedRow = {
  id: string; lineType: "OUTSOURCED";
  productName: string; spec: string; drawingUrl: string; drawingFileName: string;
  drawingUploading: boolean; drawingError?: string;
  quantity: number; purchasePrice: string; targetPrice: string;
};
type Row = ProfileRow | HardwareRow | OutsourcedRow;

// ── 默认行工厂 ───────────────────────────────────────────
function newProfile(raw?: RawProfileItem): ProfileRow {
  return { id: crypto.randomUUID(), lineType: "PROFILE",
    rawProductId: raw?.id ?? "", rawSku: raw?.sku ?? "", rawSeries: raw?.series ?? "",
    lengthMm: "", processCode: "", colorCode: "",
    operationCode: "", drawingUrl: "", drawingFileName: "", drawingUploading: false,
    quantity: 1, targetPct: "", unitPrice: null, retailPrice: null, loading: false };
}
function newHardware(item: HardwareItem): HardwareRow {
  return { id: crypto.randomUUID(), lineType: "HARDWARE",
    productId: item.id, sku: item.sku, productName: item.productName, spec: item.spec,
    drawingRequired: item.drawingRequired, drawingUrl: "", drawingFileName: "", drawingUploading: false,
    quantity: 1, targetPct: "", unitPrice: item.dealerPrice, retailPrice: item.retailPrice };
}
function newOutsourced(): OutsourcedRow {
  return { id: crypto.randomUUID(), lineType: "OUTSOURCED",
    productName: "", spec: "", drawingUrl: "", drawingFileName: "", drawingUploading: false,
    quantity: 1, purchasePrice: "", targetPrice: "" };
}

function rowTargetPrice(r: Row): number | null {
  if (r.lineType === "OUTSOURCED") {
    const v = parseFloat(r.targetPrice);
    return isFinite(v) && v > 0 ? v : null;
  }
  if (r.targetPriceOverride) {
    const v = parseFloat(r.targetPriceOverride);
    if (isFinite(v) && v > 0) return v;
  }
  if (!r.retailPrice || !r.targetPct) return null;
  const pct = parseFloat(r.targetPct);
  if (!pct) return null;
  return r.retailPrice * (pct / 100);
}

function rowUnitPrice(r: Row): number | null {
  if (r.lineType === "OUTSOURCED") {
    const v = parseFloat(r.purchasePrice);
    return isFinite(v) && v >= 0 ? v : null;
  }
  return r.unitPrice;
}

function rowReady(r: Row): boolean {
  if (r.lineType === "PROFILE") {
    return !!(r.rawProductId && r.lengthMm && r.processCode && r.colorCode && r.operationCode && r.unitPrice);
  }
  if (r.lineType === "HARDWARE") {
    if (r.drawingRequired && !r.drawingUrl) return false;
    return r.unitPrice > 0 && r.quantity > 0;
  }
  // OUTSOURCED
  return !!(r.productName && rowUnitPrice(r) != null && r.quantity > 0);
}

function rawProfileLabel(raw: RawProfileItem) {
  const parts = [
    raw.series,
    raw.productName,
    raw.spec,
    raw.lengthMm ? `${raw.lengthMm}mm 原料棒` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function QuoteWorkbench({
  dealer, addresses, options, hardwareCatalog, rawProfileCatalog, crmCustomers,
}: {
  dealer: { id: string; companyName: string; priceLevel: string; paymentMethod: string; creditBalance: number };
  addresses: Address[];
  options: { surfaceProcesses: Option[]; surfaceColors: Option[]; processingOperations: Option[] };
  hardwareCatalog: HardwareItem[];
  rawProfileCatalog: RawProfileItem[];
  crmCustomers: CrmCustomerOption[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"PROFILE" | "HARDWARE" | "OUTSOURCED">("PROFILE");
  const defaultRaw = rawProfileCatalog[0];
  const [rows, setRows] = useState<Row[]>([newProfile(defaultRaw)]);

  const [addrId, setAddrId] = useState(addresses[0]?.id ?? "");
  const [newAddr, setNewAddr] = useState({ receiverName: "", receiverPhone: "", receiverAddress: "" });
  const [useNewAddr, setUseNewAddr] = useState(addresses.length === 0);
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10);
  });
  const [remark, setRemark] = useState("");
  const [crmCustomerId, setCrmCustomerId] = useState("");
  const [crmOpportunityId, setCrmOpportunityId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function patchRow<T extends Row>(id: string, patch: Partial<T>) {
    setRows((rs) => rs.map((r) => (r.id === id ? ({ ...r, ...patch } as Row) : r)));
  }
  function removeRow(id: string) {
    setRows((rs) => (rs.length === 1 ? [newProfile(defaultRaw)] : rs.filter((r) => r.id !== id)));
  }

  async function recalcProfile(id: string, lengthMm: number) {
    patchRow<ProfileRow>(id, { loading: true, error: undefined });
    try {
      const r = await fetch(`/api/pricing/calculate?lengthMm=${lengthMm}`);
      const j = await r.json();
      if (j.code !== 0) {
        patchRow<ProfileRow>(id, { loading: false, error: j.message, unitPrice: null, retailPrice: null });
        return;
      }
      patchRow<ProfileRow>(id, { loading: false, unitPrice: j.data.dealerPrice, retailPrice: j.data.retailPrice });
    } catch (e: any) {
      patchRow<ProfileRow>(id, { loading: false, error: e?.message ?? "计算失败" });
    }
  }

  async function uploadDrawing(rowId: string, file: File) {
    patchRow(rowId, { drawingUploading: true, drawingError: undefined } as any);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch("/api/uploads/drawing", { method: "POST", body: fd });
      const j = await r.json();
      if (j.code !== 0) { patchRow(rowId, { drawingUploading: false, drawingError: j.message } as any); return; }
      patchRow(rowId, { drawingUploading: false, drawingUrl: j.data.url, drawingFileName: j.data.fileName } as any);
    } catch (e: any) {
      patchRow(rowId, { drawingUploading: false, drawingError: e?.message ?? "上传失败" } as any);
    }
  }
  function clearDrawing(rowId: string) {
    patchRow(rowId, { drawingUrl: "", drawingFileName: "", drawingError: undefined } as any);
  }

  function addProfileRow() { setRows((rs) => [...rs, newProfile(defaultRaw)]); }
  function addHardwareRow(item: HardwareItem) { setRows((rs) => [...rs, newHardware(item)]); }
  function addOutsourcedRow() { setRows((rs) => [...rs, newOutsourced()]); }

  const readyRows = useMemo(() => rows.filter(rowReady), [rows]);
  const total = useMemo(() => readyRows.reduce((s, r) => s + (rowUnitPrice(r) ?? 0) * r.quantity, 0), [readyRows]);
  const targetTotal = useMemo(
    () => readyRows.reduce((s, r) => s + ((rowTargetPrice(r) ?? rowUnitPrice(r) ?? 0)) * r.quantity, 0),
    [readyRows]
  );
  const profitTotal = targetTotal - total;
  const creditInsufficient = dealer.paymentMethod === "CREDIT" && total > dealer.creditBalance;

  async function submit(submitAfter: boolean) {
    setError("");
    if (readyRows.length === 0) return setError("请至少完整填写一行产品");
    let receiverName = "", receiverPhone = "", receiverAddress = "";
    if (useNewAddr) {
      if (!newAddr.receiverName || !newAddr.receiverPhone || !newAddr.receiverAddress) return setError("请填写完整收货信息");
      receiverName = newAddr.receiverName; receiverPhone = newAddr.receiverPhone; receiverAddress = newAddr.receiverAddress;
    } else {
      const a = addresses.find((x) => x.id === addrId);
      if (!a) return setError("请选择收货地址");
      receiverName = a.receiverName; receiverPhone = a.receiverPhone; receiverAddress = a.fullAddress;
    }
    if (creditInsufficient) return setError(`信用额度不足（可用 ${formatMoney(dealer.creditBalance)}）`);

    const lines = readyRows.map((r) => {
      if (r.lineType === "PROFILE") {
        const mm = parseFloat(r.lengthMm);
        const surfaceCode = `${r.processCode}-${r.colorCode}`;
        const surfaceLabelText = labelOf(options.surfaceProcesses, r.processCode) + "/" + labelOf(options.surfaceColors, r.colorCode);
        const baseSeries = r.rawSeries || "MR2525";
        const sku = genCustomSku(baseSeries, mm, surfaceCode, r.operationCode);
        const productName = genCustomProductName(baseSeries, mm, surfaceLabelText);
        const tp = rowTargetPrice(r);
        return {
          lineType: "PROFILE", sku, productName,
          rawProductId: r.rawProductId,
          lengthMm: mm, cutLengthMm: Math.round(mm),
          surfaceTreatment: surfaceCode,
          preprocessing: labelOf(options.processingOperations, r.operationCode),
          quantity: r.quantity, unitPrice: r.unitPrice!,
          targetPrice: tp ?? null,
          drawingUrl: r.drawingUrl || null, drawingFileName: r.drawingFileName || null,
          isCustom: true,
        };
      }
      if (r.lineType === "HARDWARE") {
        const tp = rowTargetPrice(r);
        return {
          lineType: "HARDWARE", productId: r.productId, sku: r.sku, productName: r.productName,
          spec: r.spec ?? null, quantity: r.quantity,
          unitPrice: r.unitPrice, targetPrice: tp ?? null,
          drawingUrl: r.drawingUrl || null, drawingFileName: r.drawingFileName || null,
          isCustom: false,
        };
      }
      // OUTSOURCED
      const tp = rowTargetPrice(r);
      return {
        lineType: "OUTSOURCED",
        sku: `EXT-${r.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
        productName: r.productName, spec: r.spec || null, quantity: r.quantity,
        unitPrice: rowUnitPrice(r)!, targetPrice: tp ?? null,
        drawingUrl: r.drawingUrl || null, drawingFileName: r.drawingFileName || null,
        isCustom: false,
      };
    });

    setSubmitting(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetDeliveryDate: targetDate,
          receiverName,
          receiverPhone,
          receiverAddress,
          remark,
          crmCustomerId: crmCustomerId || null,
          crmOpportunityId: crmOpportunityId || null,
          lines,
        }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      const orderNo = j.data.orderNo;
      if (submitAfter) await fetch(`/api/orders/${orderNo}/submit`, { method: "POST" });
      router.push(`/dealer/orders/${orderNo}`);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">报价下单 · {dealer.companyName}</h1>
        <div className="text-sm text-muted-foreground">{PRICE_TIER_LABEL[dealer.priceLevel as "A"|"B"|"C"] ?? dealer.priceLevel}</div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {(["PROFILE", "HARDWARE", "OUTSOURCED"] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === t ? "bg-slate-900 text-white" : "bg-white border"}`}>
                {ORDER_LINE_TYPE_LABEL[t]}
              </button>
            ))}
            <div className="flex-1" />
            {activeTab === "PROFILE" && <Button size="sm" variant="outline" onClick={addProfileRow}>+ 添加一行型材</Button>}
            {activeTab === "OUTSOURCED" && <Button size="sm" variant="outline" onClick={addOutsourcedRow}>+ 添加一行外购</Button>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeTab === "PROFILE" && (
            <ProfileTable
              rows={rows.filter((r): r is ProfileRow => r.lineType === "PROFILE")}
              patchRow={patchRow} removeRow={removeRow}
              options={options}
              rawProfileCatalog={rawProfileCatalog}
              onLengthBlur={(r: ProfileRow) => { const mm = parseFloat(r.lengthMm); if (mm > 0) recalcProfile(r.id, mm); }}
              uploadDrawing={uploadDrawing} clearDrawing={clearDrawing}
            />
          )}
          {activeTab === "HARDWARE" && (
            <HardwarePicker
              catalog={hardwareCatalog}
              addHardwareRow={addHardwareRow}
              rows={rows.filter((r): r is HardwareRow => r.lineType === "HARDWARE")}
              patchRow={patchRow} removeRow={removeRow}
              uploadDrawing={uploadDrawing} clearDrawing={clearDrawing}
            />
          )}
          {activeTab === "OUTSOURCED" && (
            <OutsourcedTable
              rows={rows.filter((r): r is OutsourcedRow => r.lineType === "OUTSOURCED")}
              patchRow={patchRow} removeRow={removeRow}
              uploadDrawing={uploadDrawing} clearDrawing={clearDrawing}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>本单所有行 · 汇总</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-2">类型</th><th className="p-2">名称 / SKU</th>
              <th className="p-2 text-right">数量</th><th className="p-2 text-right">单价</th>
              <th className="p-2 text-right">目标价</th><th className="p-2 text-right">小计</th>
              <th className="p-2">就绪</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const up = rowUnitPrice(r); const tp = rowTargetPrice(r);
                const ready = rowReady(r);
                const name = r.lineType === "PROFILE"
                  ? (r.lengthMm ? `${r.lengthMm}mm · ${r.processCode}-${r.colorCode} · ${r.operationCode}` : "（未完成）")
                  : r.lineType === "HARDWARE" ? `${r.sku} · ${r.productName}`
                  : (r.productName || "（未填写）");
                return (
                  <tr key={r.id} className="border-b">
                    <td className="p-2"><Badge className={ORDER_LINE_TYPE_COLOR[r.lineType]}>{ORDER_LINE_TYPE_LABEL[r.lineType]}</Badge></td>
                    <td className="p-2 text-xs">{name}</td>
                    <td className="p-2 text-right">{r.quantity}</td>
                    <td className="p-2 text-right">{up != null ? formatMoney(up) : "-"}</td>
                    <td className="p-2 text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8 w-24 ml-auto text-right"
                        placeholder={tp != null ? tp.toFixed(2) : "-"}
                        value={
                          r.lineType === "OUTSOURCED"
                            ? r.targetPrice
                            : (r.targetPriceOverride ?? "")
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (r.lineType === "OUTSOURCED") {
                            patchRow<OutsourcedRow>(r.id, { targetPrice: v });
                          } else if (r.lineType === "PROFILE") {
                            patchRow<ProfileRow>(r.id, { targetPriceOverride: v });
                          } else {
                            patchRow<HardwareRow>(r.id, { targetPriceOverride: v });
                          }
                        }}
                      />
                    </td>
                    <td className="p-2 text-right font-medium">{up != null ? formatMoney(up * r.quantity) : "-"}</td>
                    <td className="p-2">{ready ? "✓" : <span className="text-muted-foreground">填写中</span>}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">还没有任何行</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>收货信息</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {addresses.length > 0 && (
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!useNewAddr} onChange={() => setUseNewAddr(false)} />使用已有地址</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" checked={useNewAddr} onChange={() => setUseNewAddr(true)} />新填地址</label>
                </div>
              )}
              {!useNewAddr && addresses.length > 0 ? (
                <div className="space-y-2">
                  {addresses.map((a) => (
                    <label key={a.id} className="flex items-start gap-2 border rounded p-3 cursor-pointer hover:bg-slate-50">
                      <input type="radio" checked={addrId === a.id} onChange={() => setAddrId(a.id)} className="mt-1" />
                      <div className="text-sm">
                        <div className="font-medium">{a.receiverName} · {a.receiverPhone} {a.isDefault && <span className="text-xs text-blue-600">(默认)</span>}</div>
                        <div className="text-muted-foreground">{a.fullAddress}</div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>收货人</Label><Input value={newAddr.receiverName} onChange={(e) => setNewAddr({ ...newAddr, receiverName: e.target.value })} /></div>
                  <div><Label>电话</Label><Input value={newAddr.receiverPhone} onChange={(e) => setNewAddr({ ...newAddr, receiverPhone: e.target.value })} /></div>
                  <div className="col-span-2"><Label>详细地址</Label><Input value={newAddr.receiverAddress} onChange={(e) => setNewAddr({ ...newAddr, receiverAddress: e.target.value })} /></div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>订单信息</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>期望交期</Label><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></div>
              <div>
                <Label>关联 CRM 客户</Label>
                <select
                  className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm"
                  value={crmCustomerId}
                  onChange={(e) => {
                    setCrmCustomerId(e.target.value);
                    setCrmOpportunityId("");
                  }}
                >
                  <option value="">不关联客户</option>
                  {crmCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>
                  ))}
                </select>
              </div>
              {crmCustomerId && (
                <div>
                  <Label>关联商机</Label>
                  <select
                    className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm"
                    value={crmOpportunityId}
                    onChange={(e) => setCrmOpportunityId(e.target.value)}
                  >
                    <option value="">不关联商机</option>
                    {(crmCustomers.find((customer) => customer.id === crmCustomerId)?.opportunities ?? []).map((opportunity) => (
                      <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>
                    ))}
                  </select>
                </div>
              )}
              <div><Label>订单备注</Label><Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="整单级别备注" /></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>金额汇总</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span>有效行数</span><span>{readyRows.length}</span></div>
              <div className="flex justify-between text-sm"><span>合计数量</span><span>{readyRows.reduce((s, r) => s + r.quantity, 0)} 件</span></div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>采购总金额</span><span className="text-emerald-700">{formatMoney(total)}</span></div>
              <div className="flex justify-between text-sm"><span>目标销售总金额</span><span>{formatMoney(targetTotal)}</span></div>
              <div className="flex justify-between text-base font-semibold">
                <span>预计总毛利</span>
                <span className={profitTotal >= 0 ? "text-blue-700" : "text-red-600"}>{formatMoney(profitTotal)}</span>
              </div>
              {dealer.paymentMethod === "CREDIT" && (
                <div className="text-xs text-muted-foreground">
                  可用信用: {formatMoney(dealer.creditBalance)}
                  {creditInsufficient && <span className="text-red-600 block">⚠️ 信用额度不足</span>}
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={() => submit(false)} disabled={submitting || creditInsufficient} variant="outline">保存草稿</Button>
              <Button className="w-full" onClick={() => submit(true)} disabled={submitting || creditInsufficient}>
                {submitting ? "提交中..." : "提交审核"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── 型材表 ───────────────────────────────────────────────
function ProfileTable({
  rows, patchRow, removeRow, options, rawProfileCatalog, onLengthBlur, uploadDrawing, clearDrawing,
}: any) {
  return (
    <div className="overflow-x-auto">
      {rawProfileCatalog.length === 0 && (
        <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          ⚠ 暂无可选原料型材。请联系管理员在产品目录加入 isRawMaterial 型材。
        </div>
      )}
      {rawProfileCatalog.length > 0 && (
        <div className="mb-3 rounded-2xl border border-teal-100 bg-teal-50/70 p-3 text-xs leading-5 text-teal-900">
          这里选择的是用于加工的型材系列/规格，不需要理解内部 SKU。若只有一种常用型材，系统已默认选中；不确定时请选择与客户需求一致的系列和规格。
        </div>
      )}
      <table className="w-full text-sm min-w-[1200px]">
        <thead className="bg-slate-50 border-b"><tr className="text-left">
          <th className="p-2">型材系列 / 规格</th>
          <th className="p-2">长度(mm)</th><th className="p-2">表面工艺</th><th className="p-2">颜色</th>
          <th className="p-2">加工操作</th><th className="p-2">图纸</th>
          <th className="p-2 w-20">数量</th><th className="p-2 w-24">目标%</th>
          <th className="p-2 text-right">采购单价</th><th className="p-2 text-right">零售价</th>
          <th className="p-2 text-right">目标价</th><th className="p-2 text-right">小计</th><th className="p-2"></th>
        </tr></thead>
        <tbody>
          {rows.map((r: ProfileRow) => {
            const tp = rowTargetPrice(r);
            const sub = r.unitPrice != null ? r.unitPrice * r.quantity : null;
            return (
              <tr key={r.id} className="border-b">
                <td className="p-2">
                  <select className="h-8 border rounded px-2 text-sm bg-white min-w-[160px]"
                    value={r.rawProductId}
                    onChange={(e) => {
                      const raw = rawProfileCatalog.find((x: RawProfileItem) => x.id === e.target.value);
                      patchRow(r.id, { rawProductId: raw?.id ?? "", rawSku: raw?.sku ?? "", rawSeries: raw?.series ?? "" });
                    }}>
                    <option value="">请选择型材系列/规格</option>
                    {rawProfileCatalog.map((x: RawProfileItem) => (
                      <option key={x.id} value={x.id}>{rawProfileLabel(x)}</option>
                    ))}
                  </select>
                </td>
                <td className="p-2"><Input type="number" min={1} className="h-8 w-24" value={r.lengthMm}
                  onChange={(e) => patchRow(r.id, { lengthMm: e.target.value })} onBlur={() => onLengthBlur(r)} /></td>
                <td className="p-2"><Sel value={r.processCode} onChange={(v: string) => patchRow(r.id, { processCode: v })} options={options.surfaceProcesses} /></td>
                <td className="p-2"><Sel value={r.colorCode} onChange={(v: string) => patchRow(r.id, { colorCode: v })} options={options.surfaceColors} /></td>
                <td className="p-2"><Sel value={r.operationCode} onChange={(v: string) => patchRow(r.id, { operationCode: v })} options={options.processingOperations} /></td>
                <td className="p-2"><DrawingCell row={r} uploadDrawing={uploadDrawing} clearDrawing={clearDrawing} /></td>
                <td className="p-2"><Input type="number" min={1} className="h-8 w-16" value={r.quantity}
                  onChange={(e) => patchRow(r.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} /></td>
                <td className="p-2"><Input type="number" className="h-8 w-20" placeholder="90" value={r.targetPct}
                  onChange={(e) => patchRow(r.id, { targetPct: e.target.value })} /></td>
                <td className="p-2 text-right">{r.loading ? "..." : r.error ? <span className="text-red-600 text-xs">{r.error}</span> : r.unitPrice != null ? formatMoney(r.unitPrice) : "-"}</td>
                <td className="p-2 text-right text-muted-foreground">{r.retailPrice != null ? formatMoney(r.retailPrice) : "-"}</td>
                <td className="p-2 text-right">{tp != null ? formatMoney(tp) : "-"}</td>
                <td className="p-2 text-right font-medium">{sub != null ? formatMoney(sub) : "-"}</td>
                <td className="p-2"><button onClick={() => removeRow(r.id)} className="text-red-600 text-xs hover:underline">删除</button></td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={13} className="p-6 text-center text-muted-foreground">型材标签内暂无行，点 + 添加</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── 零配件挑选 ───────────────────────────────────────────
function HardwarePicker({ catalog, addHardwareRow, rows, patchRow, removeRow, uploadDrawing, clearDrawing }: any) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold mb-2">目录（点击加入订单）</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {catalog.map((it: HardwareItem) => (
            <button key={it.id} onClick={() => addHardwareRow(it)}
              className="text-left border rounded p-3 hover:border-slate-900 transition">
              <div className="font-mono text-sm">{it.sku}</div>
              <div className="text-xs text-muted-foreground">{it.productName}</div>
              {it.spec && <div className="text-xs text-muted-foreground">{it.spec}</div>}
              <div className="mt-1 text-sm font-semibold">{formatMoney(it.dealerPrice)}<span className="text-xs text-muted-foreground ml-1">/ {formatMoney(it.retailPrice)}</span></div>
              {it.drawingRequired && <div className="text-xs text-amber-600 mt-1">需上传图纸</div>}
            </button>
          ))}
        </div>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-2">SKU</th><th className="p-2">名称 / 规格</th>
              <th className="p-2 w-20">数量</th><th className="p-2 w-24">目标%</th>
              <th className="p-2">图纸</th>
              <th className="p-2 text-right">采购单价</th><th className="p-2 text-right">零售价</th>
              <th className="p-2 text-right">目标价</th><th className="p-2 text-right">小计</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map((r: HardwareRow) => {
                const tp = rowTargetPrice(r);
                return (
                  <tr key={r.id} className="border-b">
                    <td className="p-2 font-mono">{r.sku}</td>
                    <td className="p-2 text-xs"><div>{r.productName}</div>{r.spec && <div className="text-muted-foreground">{r.spec}</div>}</td>
                    <td className="p-2"><Input type="number" min={1} className="h-8 w-16" value={r.quantity}
                      onChange={(e) => patchRow(r.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} /></td>
                    <td className="p-2"><Input type="number" className="h-8 w-20" placeholder="90" value={r.targetPct}
                      onChange={(e) => patchRow(r.id, { targetPct: e.target.value })} /></td>
                    <td className="p-2">
                      <DrawingCell row={r} uploadDrawing={uploadDrawing} clearDrawing={clearDrawing} />
                      {r.drawingRequired && !r.drawingUrl && <div className="text-xs text-amber-600 mt-1">⚠ 必传</div>}
                    </td>
                    <td className="p-2 text-right">{formatMoney(r.unitPrice)}</td>
                    <td className="p-2 text-right text-muted-foreground">{formatMoney(r.retailPrice)}</td>
                    <td className="p-2 text-right">{tp != null ? formatMoney(tp) : "-"}</td>
                    <td className="p-2 text-right font-medium">{formatMoney(r.unitPrice * r.quantity)}</td>
                    <td className="p-2"><button onClick={() => removeRow(r.id)} className="text-red-600 text-xs hover:underline">删除</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 外购表 ───────────────────────────────────────────────
function OutsourcedTable({ rows, patchRow, removeRow, uploadDrawing, clearDrawing }: any) {
  return (
    <div className="overflow-x-auto">
      <div className="text-xs text-muted-foreground mb-2">外购件由经销商自行采购，Parti 加工车间不经手此类行。</div>
      <table className="w-full text-sm min-w-[1000px]">
        <thead className="bg-slate-50 border-b"><tr className="text-left">
          <th className="p-2">名称</th><th className="p-2">规格</th><th className="p-2">图纸</th>
          <th className="p-2 w-20">数量</th>
          <th className="p-2 w-28">采购单价</th><th className="p-2 w-28">目标售价</th>
          <th className="p-2 text-right">小计</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map((r: OutsourcedRow) => {
            const up = rowUnitPrice(r);
            return (
              <tr key={r.id} className="border-b">
                <td className="p-2"><Input className="h-8" value={r.productName} onChange={(e) => patchRow(r.id, { productName: e.target.value })} placeholder="如 18mm 多层板" /></td>
                <td className="p-2"><Input className="h-8" value={r.spec} onChange={(e) => patchRow(r.id, { spec: e.target.value })} placeholder="规格 / 品牌" /></td>
                <td className="p-2"><DrawingCell row={r} uploadDrawing={uploadDrawing} clearDrawing={clearDrawing} /></td>
                <td className="p-2"><Input type="number" min={1} className="h-8 w-16" value={r.quantity}
                  onChange={(e) => patchRow(r.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} /></td>
                <td className="p-2"><Input type="number" step="0.01" className="h-8" value={r.purchasePrice}
                  onChange={(e) => patchRow(r.id, { purchasePrice: e.target.value })} /></td>
                <td className="p-2"><Input type="number" step="0.01" className="h-8" value={r.targetPrice}
                  onChange={(e) => patchRow(r.id, { targetPrice: e.target.value })} /></td>
                <td className="p-2 text-right font-medium">{up != null ? formatMoney(up * r.quantity) : "-"}</td>
                <td className="p-2"><button onClick={() => removeRow(r.id)} className="text-red-600 text-xs hover:underline">删除</button></td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">暂无外购行</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── 公共子组件 ───────────────────────────────────────────
function DrawingCell({ row, uploadDrawing, clearDrawing }: any) {
  if (row.drawingUrl) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <a href={row.drawingUrl} target="_blank" rel="noopener" className="text-blue-600 hover:underline truncate max-w-[140px]">📎 {row.drawingFileName}</a>
        <button onClick={() => clearDrawing(row.id)} className="text-red-600 hover:underline">移除</button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <input type="file" accept=".pdf,.dwg,.step,.stp,application/pdf" disabled={row.drawingUploading}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDrawing(row.id, f); e.target.value = ""; }}
        className="text-xs w-44" />
      {row.drawingUploading && <div className="text-xs text-muted-foreground">上传中...</div>}
      {row.drawingError && <div className="text-xs text-red-600">{row.drawingError}</div>}
    </div>
  );
}
function Sel({ value, onChange, options }: any) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 border rounded px-2 text-sm bg-white min-w-[120px]">
      <option value="">请选择</option>
      {options.map((o: Option) => <option key={o.code} value={o.code}>{o.code} · {o.label}</option>)}
    </select>
  );
}
function labelOf(opts: Option[], code: string): string {
  return opts.find((o) => o.code === code)?.label ?? code;
}
