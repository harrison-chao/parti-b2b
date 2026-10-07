"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatMoney, ORDER_LINE_TYPE_LABEL, ORDER_LINE_TYPE_COLOR } from "@/lib/utils";
import { genCustomSku, genCustomProductName } from "@/lib/options";
import { PRICE_TIER_LABEL } from "@/lib/pricing";
import {
  distinctSeries, processCodesOf, colorCodesOf, variantsOf, resolveMaterial, materialHint,
} from "@/lib/material-select";

type Option = { code: string; label: string };
type Address = { id: string; receiverName: string; receiverPhone: string; fullAddress: string; isDefault: boolean; label?: string | null; addressType?: string | null };
type HardwareItem = {
  id: string; sku: string; productName: string; series: string; spec: string | null;
  retailPrice: number; dealerPrice: number; drawingRequired: boolean;
};
type RawProfileItem = {
  id: string; sku: string; productName: string; series: string; spec: string | null; lengthMm: number | null;
  surfaceProcessCode?: string | null; surfaceColorCode?: string | null; materialStage?: string | null;
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
  lengthMm: string; lengthInch: string; processCode: string; colorCode: string; processCodes: string[];
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
    lengthMm: "", lengthInch: "", processCode: raw?.surfaceProcessCode ?? "", colorCode: raw?.surfaceColorCode ?? "",
    // 与管理员端同口径：截断(L)是切长的隐含工序不进勾选；默认铣孔+预埋（Base 实证 铣孔82%/预埋77%）
    processCodes: ["D", "EM"], drawingUrl: "", drawingFileName: "", drawingUploading: false,
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
    // 原料已解析即代表表面/颜色与档案一致（级联选择不可能产生不一致组合）
    return !!(r.rawProductId && r.lengthMm && r.unitPrice);
  }
  if (r.lineType === "HARDWARE") {
    if (r.drawingRequired && !r.drawingUrl) return false;
    return r.unitPrice > 0 && r.quantity > 0;
  }
  // OUTSOURCED
  return !!(r.productName && rowUnitPrice(r) != null && r.quantity > 0);
}

/** 载入来源单（再来一单/继续编辑草稿）映射回工作台行；已下架的原料/五金行跳过并计数 */
function rowsFromInitial(initial: any, rawProfileCatalog: RawProfileItem[], hardwareCatalog: HardwareItem[]): { rows: Row[]; skipped: number } {
  const out: Row[] = [];
  let skipped = 0;
  for (const l of initial.lines ?? []) {
    if (l.lineType === "PROFILE") {
      const raw = rawProfileCatalog.find((p) => p.id === l.rawProductId);
      if (!raw) { skipped++; continue; }
      out.push({
        id: crypto.randomUUID(), lineType: "PROFILE",
        rawProductId: raw.id, rawSku: raw.sku, rawSeries: raw.series ?? "",
        lengthMm: l.cutLengthMm != null ? String(l.cutLengthMm) : "",
        lengthInch: l.cutLengthMm != null ? (l.cutLengthMm / 25.4).toFixed(1) : "",
        processCode: l.surfaceProcessCode ?? raw.surfaceProcessCode ?? "",
        colorCode: l.surfaceColorCode ?? raw.surfaceColorCode ?? "",
        processCodes: Array.isArray(l.processCodes) ? l.processCodes.filter((c: string) => c !== "L") : [],
        drawingUrl: l.drawingUrl ?? "", drawingFileName: l.drawingFileName ?? "", drawingUploading: false,
        quantity: l.quantity ?? 1, targetPct: "",
        targetPriceOverride: l.targetPrice != null ? String(l.targetPrice) : undefined,
        unitPrice: null, retailPrice: null, loading: false,
      });
    } else if (l.lineType === "HARDWARE") {
      const hw = hardwareCatalog.find((p) => p.id === l.productId);
      if (!hw) { skipped++; continue; }
      out.push({
        ...newHardware(hw),
        quantity: l.quantity ?? 1,
        targetPriceOverride: l.targetPrice != null ? String(l.targetPrice) : undefined,
        drawingUrl: l.drawingUrl ?? "", drawingFileName: l.drawingFileName ?? "",
      });
    } else {
      out.push({
        id: crypto.randomUUID(), lineType: "OUTSOURCED",
        productName: l.productName ?? "", spec: l.spec ?? "",
        drawingUrl: l.drawingUrl ?? "", drawingFileName: l.drawingFileName ?? "", drawingUploading: false,
        quantity: l.quantity ?? 1,
        purchasePrice: l.purchasePrice != null ? String(l.purchasePrice) : "",
        targetPrice: l.targetPriceText ?? "",
      });
    }
  }
  return { rows: out.length ? out : [newProfile(rawProfileCatalog[0])], skipped };
}

export function QuoteWorkbench({
  dealer, addresses, initial, options, hardwareCatalog, rawProfileCatalog, crmCustomers,
}: {
  dealer: { id: string; companyName: string; priceLevel: string; paymentMethod: string; creditBalance: number };
  addresses: Address[];
  initial: any | null;
  options: { surfaceProcesses: Option[]; surfaceColors: Option[]; processingOperations: Option[] };
  hardwareCatalog: HardwareItem[];
  rawProfileCatalog: RawProfileItem[];
  crmCustomers: CrmCustomerOption[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"PROFILE" | "HARDWARE" | "OUTSOURCED">("PROFILE");
  const defaultRaw = rawProfileCatalog[0];
  const initialParsed = initial ? rowsFromInitial(initial, rawProfileCatalog, hardwareCatalog) : null;
  const [rows, setRows] = useState<Row[]>(initialParsed ? initialParsed.rows : [newProfile(defaultRaw)]);
  // 编辑模式：更新原单（DRAFT/MODIFYING 草稿）；再来一单：initial 有但 editMode=false，提交生成新单
  const editOrderNo = initial?.editMode ? initial.orderNo as string : null;

  // 地址：来源单收货人优先匹配地址簿，匹配不上转为"新填地址"预填
  const initAddr = initial
    ? (addresses.find((a) => a.fullAddress === initial.receiverAddress && a.receiverName === initial.receiverName) ?? null)
    : null;
  const [addrId, setAddrId] = useState(initial ? (initAddr?.id ?? "") : (addresses[0]?.id ?? ""));
  const [newAddr, setNewAddr] = useState(() => initial && !initAddr
    ? { receiverName: initial.receiverName ?? "", receiverPhone: initial.receiverPhone ?? "", receiverAddress: initial.receiverAddress ?? "" }
    : { receiverName: "", receiverPhone: "", receiverAddress: "" });
  // 新填地址默认沉淀到自己的地址簿（代发客户逐单换终端地址，回存后下次可选）
  const [saveAddr, setSaveAddr] = useState(true);
  const [addrLabel, setAddrLabel] = useState("");
  const [useNewAddr, setUseNewAddr] = useState(addresses.length === 0 || (!!initial && !initAddr));
  const [targetDate, setTargetDate] = useState(() => initial?.targetDeliveryDate ?? (() => {
    const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10);
  })() as string);
  const [remark, setRemark] = useState(initial?.remark ?? "");
  const [crmCustomerId, setCrmCustomerId] = useState("");
  const [crmOpportunityId, setCrmOpportunityId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 上次未完成报价的本地暂存（按经销商隔离）；有载入单时优先载入单
  const draftKey = `parti-quote-draft-${dealer.id}`;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (initial || restored) return;
    setRestored(true);
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (saved && Array.isArray(saved.rows) && saved.rows.some((r: Row) => rowReady(r))) {
        if (window.confirm("检测到上次未完成的报价，是否恢复？")) {
          setRows(saved.rows);
          if (saved.targetDate) setTargetDate(saved.targetDate);
          if (saved.remark) setRemark(saved.remark);
          if (saved.useNewAddr) { setUseNewAddr(true); setNewAddr(saved.newAddr ?? { receiverName: "", receiverPhone: "", receiverAddress: "" }); }
          else if (saved.addrId) setAddrId(saved.addrId);
        } else {
          localStorage.removeItem(draftKey);
        }
      }
    } catch { /* 存储损坏则忽略 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 行有实质内容时暂存；提交成功后清除
  useEffect(() => {
    if (editOrderNo) return; // 编辑模式以服务端草稿为准，不双写本地
    if (!rows.some(rowReady) && !remark) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ rows, targetDate, remark, addrId, useNewAddr, newAddr, savedAt: Date.now() }));
    } catch { /* 配额满则放弃暂存 */ }
  }, [rows, targetDate, remark, addrId, useNewAddr, newAddr, editOrderNo, draftKey]);
  // 有未保存内容时拦截误关页面
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (rows.some(rowReady) && !editOrderNo) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [rows, editOrderNo]);
  // 载入/恢复的 PROFILE 行价格是空的 → 自动重算（loading 状态防循环）
  useEffect(() => {
    for (const r of rows) {
      if (r.lineType === "PROFILE" && r.rawProductId && r.lengthMm && r.unitPrice == null && !r.loading && !r.error) {
        void recalcProfile(r.id, parseFloat(r.lengthMm), r.rawProductId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  function patchRow<T extends Row>(id: string, patch: Partial<T>) {
    setRows((rs) => rs.map((r) => (r.id === id ? ({ ...r, ...patch } as Row) : r)));
  }
  function removeRow(id: string) {
    setRows((rs) => (rs.length === 1 ? [newProfile(defaultRaw)] : rs.filter((r) => r.id !== id)));
  }

  async function recalcProfile(id: string, lengthMm: number, rawProductIdOverride?: string) {
    patchRow<ProfileRow>(id, { loading: true, error: undefined });
    try {
      // 带原料 SKU 级口径计价（米重/良率/每米价三级回退），与下单服务端同引擎
      const matched = rows.find((row) => row.id === id);
      const raw = matched && "rawProductId" in matched ? matched : undefined;
      const rid = rawProductIdOverride ?? raw?.rawProductId;
      const qs = rid ? `&rawProductId=${rid}` : "";
      const r = await fetch(`/api/pricing/calculate?lengthMm=${lengthMm}${qs}`);
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
      if (saveAddr && newAddr.receiverName && newAddr.receiverPhone && newAddr.receiverAddress) {
        void fetch(`/api/dealers/${dealer.id}/addresses`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiverName: newAddr.receiverName, receiverPhone: newAddr.receiverPhone,
            detailAddress: newAddr.receiverAddress,
            label: addrLabel || null, addressType: "dropship",
          }),
        });
      }
    } else {
      const a = addresses.find((x) => x.id === addrId);
      if (!a) return setError("请选择收货地址");
      receiverName = a.receiverName; receiverPhone = a.receiverPhone; receiverAddress = a.fullAddress;
    }
    if (creditInsufficient) return setError(`信用额度不足（可用 ${formatMoney(dealer.creditBalance)}）`);

    const lines = readyRows.map((r) => {
      if (r.lineType === "PROFILE") {
        const mm = parseFloat(r.lengthMm);
        const surfaceCode = r.colorCode ? `${r.processCode}-${r.colorCode}` : r.processCode;
        const surfaceLabelText = labelOf(options.surfaceProcesses, r.processCode)
          + (r.colorCode ? "/" + labelOf(options.surfaceColors, r.colorCode) : "");
        const baseSeries = r.rawSeries || "MR2525";
        // 截断为隐含工序（有切长即有 L），与管理员端一致
        const opCodes = ["L", ...r.processCodes];
        const sku = genCustomSku(baseSeries, mm, surfaceCode, opCodes.join(""));
        const productName = genCustomProductName(baseSeries, mm, surfaceLabelText);
        const tp = rowTargetPrice(r);
        return {
          lineType: "PROFILE", sku, productName,
          rawProductId: r.rawProductId,
          lengthMm: mm, cutLengthMm: Math.round(mm),
          surfaceTreatment: surfaceCode,
          surfaceProcessCode: r.processCode || null,
          surfaceColorCode: r.colorCode || null,
          processCodes: opCodes,
          preprocessing: opCodes.map((c) => labelOf(options.processingOperations, c)).join("、"),
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
      let orderNo: string;
      if (editOrderNo) {
        // 继续编辑草稿：更新原单（行计价服务端权威），可选直接提交审核
        const r = await fetch(`/api/orders/${editOrderNo}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetDeliveryDate: targetDate,
            receiverName, receiverPhone, receiverAddress,
            remark, lines,
          }),
        });
        const j = await r.json();
        if (j.code !== 0) { setError(j.message); return; }
        orderNo = j.data.orderNo;
        if (submitAfter) await fetch(`/api/orders/${orderNo}/submit`, { method: "POST" });
        toast.success(submitAfter ? "草稿已更新并提交审核，通常 1 个工作日内完成审核" : "草稿已更新");
      } else {
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
        orderNo = j.data.orderNo;
        if (submitAfter) await fetch(`/api/orders/${orderNo}/submit`, { method: "POST" });
        toast.success(submitAfter ? "订单已提交，通常 1 个工作日内完成审核" : "草稿已保存，可随时在“我的订单”继续编辑");
      }
      try { localStorage.removeItem(draftKey); } catch { /* 忽略 */ }
      router.push(`/dealer/orders/${orderNo}`);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          报价下单 · {dealer.companyName}
          {editOrderNo && <span className="ml-3 align-middle"><Badge className="bg-amber-500/15 text-amber-300">编辑草稿 {editOrderNo}</Badge></span>}
          {initial && !editOrderNo && <span className="ml-3 align-middle"><Badge className="bg-sky-500/15 text-sky-300">按 {initial.orderNo} 复制</Badge></span>}
        </h1>
        <div className="text-sm text-muted-foreground">{PRICE_TIER_LABEL[dealer.priceLevel as "A"|"B"|"C"] ?? dealer.priceLevel}</div>
      </div>
      {(initialParsed?.skipped ?? 0) > 0 && (
        <p className="text-sm text-amber-500">来源单有 {initialParsed?.skipped} 行原料/五金已下架，已跳过，请核对明细</p>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {(["PROFILE", "HARDWARE", "OUTSOURCED"] as const).map((t) => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${activeTab === t ? "bg-slate-900 text-white" : "bg-card border"}`}>
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
              onRowResolved={(next: ProfileRow) => {
                const mm = parseFloat(next.lengthMm);
                if (mm > 0) recalcProfile(next.id, mm, next.rawProductId || undefined);
              }}
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
            <thead className="bg-muted/50 border-b"><tr className="text-left">
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
                  ? (r.lengthMm
                    ? `${r.lengthMm}mm · ${labelOf(options.surfaceProcesses, r.processCode)}${r.colorCode ? "/" + labelOf(options.surfaceColors, r.colorCode) : ""} · ${["L", ...r.processCodes].map((c) => labelOf(options.processingOperations, c)).join("、")}`
                    : "（未完成）")
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
                    <label key={a.id} className="flex items-start gap-2 border rounded p-3 cursor-pointer hover:bg-muted/50">
                      <input type="radio" checked={addrId === a.id} onChange={() => setAddrId(a.id)} className="mt-1" />
                      <div className="text-sm">
                        <div className="font-medium">
                          {a.addressType === "dropship" && <span className="text-cyan-400 text-xs mr-1">[代发]</span>}
                          {a.label && <span className="text-xs text-muted-foreground mr-1">{a.label} · </span>}
                          {a.receiverName} · {a.receiverPhone} {a.isDefault && <span className="text-xs text-sky-400">(默认)</span>}
                        </div>
                        <div className="text-muted-foreground">{a.fullAddress}</div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>收货人（终端客户）</Label><Input value={newAddr.receiverName} onChange={(e) => setNewAddr({ ...newAddr, receiverName: e.target.value })} /></div>
                  <div><Label>电话</Label><Input value={newAddr.receiverPhone} onChange={(e) => setNewAddr({ ...newAddr, receiverPhone: e.target.value })} /></div>
                  <div className="col-span-2"><Label>地址标签（可选，便于下次选用）</Label><Input value={addrLabel} onChange={(e) => setAddrLabel(e.target.value)} placeholder="如 代发·杭州万象城店" /></div>
                  <div className="col-span-2"><Label>详细地址</Label><Input value={newAddr.receiverAddress} onChange={(e) => setNewAddr({ ...newAddr, receiverAddress: e.target.value })} /></div>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} />
                    保存到我的地址簿（代发地址，下次下单可直接选用）
                  </label>
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
                  className="h-10 w-full rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm"
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
                    className="h-10 w-full rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm"
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
              <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>采购总金额</span><span className="text-emerald-300">{formatMoney(total)}</span></div>
              <div className="flex justify-between text-sm"><span>目标销售总金额</span><span>{formatMoney(targetTotal)}</span></div>
              <div className="flex justify-between text-base font-semibold">
                <span>预计总毛利</span>
                <span className={profitTotal >= 0 ? "text-sky-300" : "text-red-400"}>{formatMoney(profitTotal)}</span>
              </div>
              {dealer.paymentMethod === "CREDIT" && (
                <div className="text-xs text-muted-foreground">
                  可用信用: {formatMoney(dealer.creditBalance)}
                  {creditInsufficient && <span className="text-red-400 block">⚠️ 信用额度不足</span>}
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={() => submit(false)} disabled={submitting || creditInsufficient} variant="outline">{editOrderNo ? "保存修改" : "保存草稿"}</Button>
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
  rows, patchRow, removeRow, options, rawProfileCatalog, onLengthBlur, onRowResolved, uploadDrawing, clearDrawing,
}: any) {
  const seriesList = distinctSeries(rawProfileCatalog);
  const procLabel = (c: string) => (c ? labelOf(options.surfaceProcesses, c) : "无/本色");
  const colorLabel = (c: string) => (c ? labelOf(options.surfaceColors, c) : "不限");

  // 三步级联：型材 → 表面处理 → 颜色；未显式选择时自动取该级第一个可用值，然后解析内部原料 SKU
  function pick(r: ProfileRow, series?: string, proc?: string, col?: string) {
    const s2 = series ?? r.rawSeries;
    const procs = processCodesOf(rawProfileCatalog, s2);
    const p2 = proc ?? (procs.includes(r.processCode) ? r.processCode : procs[0] ?? "");
    const cols = colorCodesOf(rawProfileCatalog, s2, p2);
    const c2 = col ?? (cols.includes(r.colorCode) ? r.colorCode : cols[0] ?? "");
    const m = resolveMaterial(rawProfileCatalog, s2, p2, c2);
    const next: ProfileRow = {
      ...r, rawSeries: s2, processCode: p2, colorCode: c2,
      rawProductId: m?.id ?? "", rawSku: m?.sku ?? "",
    };
    patchRow(r.id, next);
    if (m && m.id !== r.rawProductId) onRowResolved(next);
  }

  return (
    <div className="overflow-x-auto">
      {rawProfileCatalog.length === 0 && (
        <div className="mb-3 text-xs text-amber-300 bg-amber-500/10 border border-amber-200 rounded p-2">
          ⚠ 暂无可选原料型材。请联系管理员在产品目录加入 isRawMaterial 型材。
        </div>
      )}
      {rawProfileCatalog.length > 0 && (
        <div className="mb-3 rounded-2xl border border-teal-100 bg-teal-50/70 p-3 text-xs leading-5 text-teal-900">
          按三步选择：型材 → 表面处理 → 颜色，再填切长与数量即可；备料棒长与内部编码由系统自动匹配，无需理解 SKU 编码。
        </div>
      )}
      <table className="w-full text-sm min-w-[1200px]">
        <thead className="bg-muted/50 border-b"><tr className="text-left">
          <th className="p-2">型材</th>
          <th className="p-2">切长（寸/mm）</th><th className="p-2">表面处理</th><th className="p-2">颜色</th>
          <th className="p-2">加工操作</th><th className="p-2">图纸</th>
          <th className="p-2 w-20">数量</th><th className="p-2 w-24">目标%</th>
          <th className="p-2 text-right">采购单价</th><th className="p-2 text-right">零售价</th>
          <th className="p-2 text-right">目标价</th><th className="p-2 text-right">小计</th><th className="p-2"></th>
        </tr></thead>
        <tbody>
          {rows.map((r: ProfileRow) => {
            const tp = rowTargetPrice(r);
            const sub = r.unitPrice != null ? r.unitPrice * r.quantity : null;
            const resolved = rawProfileCatalog.find((x: RawProfileItem) => x.id === r.rawProductId);
            const variants = variantsOf(rawProfileCatalog, r.rawSeries, r.processCode, r.colorCode);
            return (
              <tr key={r.id} className="border-b">
                <td className="p-2">
                  <select className="h-8 border rounded px-2 text-sm bg-card min-w-[130px]"
                    value={r.rawSeries}
                    onChange={(e) => pick(r, e.target.value)}>
                    <option value="">选择型材</option>
                    {seriesList.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="text-xs text-muted-foreground mt-0.5 min-h-[1em]">
                    {resolved
                      ? <span>
                          {resolved.materialStage === "SEMI"
                            ? <span className="text-amber-600 mr-1">[半成品段]</span>
                            : null}
                          按 {materialHint(resolved, false)} 加工
                        </span>
                      : (r.rawSeries ? "选完表面/颜色自动匹配" : "")}
                  </div>
                  {variants.length > 1 && (
                    <select className="h-7 border rounded px-1 text-xs mt-1 bg-card"
                      value={r.rawProductId}
                      onChange={(e) => {
                        const m = rawProfileCatalog.find((x: RawProfileItem) => x.id === e.target.value)!;
                        const next = { ...r, rawProductId: m.id, rawSku: m.sku };
                        patchRow(r.id, next);
                        onRowResolved(next);
                      }}>
                      {variants.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.materialStage === "SEMI" ? "半成品段" : "备料棒"} {(m.lengthMm ?? 0) / 1000}m
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <div className="relative">
                      <Input type="number" min={1} step="0.1" className="h-8 w-[4.5rem] pr-6" value={r.lengthInch}
                        onChange={(e) => { const v = e.target.value; patchRow(r.id, { lengthInch: v, lengthMm: v ? String(Math.round(parseFloat(v) * 25.4)) : "" }); }}
                        onBlur={() => onLengthBlur(r)} />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">寸</span>
                    </div>
                    <div className="relative">
                      <Input type="number" min={1} className="h-8 w-[4.5rem] pr-7" value={r.lengthMm}
                        onChange={(e) => { const v = e.target.value; patchRow(r.id, { lengthMm: v, lengthInch: v ? (parseFloat(v) / 25.4).toFixed(1) : "" }); }}
                        onBlur={() => onLengthBlur(r)} />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">mm</span>
                    </div>
                  </div>
                </td>
                <td className="p-2"><Sel value={r.processCode} onChange={(v: string) => pick(r, undefined, v)} hideCode
                  options={processCodesOf(rawProfileCatalog, r.rawSeries).map((c: string) => ({ code: c, label: procLabel(c) }))} /></td>
                <td className="p-2"><Sel value={r.colorCode} onChange={(v: string) => pick(r, undefined, undefined, v)} hideCode
                  options={colorCodesOf(rawProfileCatalog, r.rawSeries, r.processCode).map((c: string) => ({ code: c, label: colorLabel(c) }))} /></td>
                <td className="p-2">
                  <div className="flex flex-col gap-1">
                    {options.processingOperations.filter((o: Option) => o.code !== "L").map((o: Option) => (
                      <label key={o.code} className="flex items-center gap-1 text-xs whitespace-nowrap">
                        <input type="checkbox" checked={r.processCodes.includes(o.code)}
                          onChange={() => patchRow(r.id, {
                            processCodes: r.processCodes.includes(o.code)
                              ? r.processCodes.filter((c: string) => c !== o.code)
                              : [...r.processCodes, o.code],
                          })} />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="p-2"><DrawingCell row={r} uploadDrawing={uploadDrawing} clearDrawing={clearDrawing} /></td>
                <td className="p-2"><Input type="number" min={1} className="h-8 w-16" value={r.quantity}
                  onChange={(e) => patchRow(r.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} /></td>
                <td className="p-2"><Input type="number" className="h-8 w-20" placeholder="90" value={r.targetPct}
                  onChange={(e) => patchRow(r.id, { targetPct: e.target.value })} /></td>
                <td className="p-2 text-right">{r.loading ? "..." : r.error ? <span className="text-red-400 text-xs">{r.error}</span> : r.unitPrice != null ? formatMoney(r.unitPrice) : "-"}</td>
                <td className="p-2 text-right text-muted-foreground">{r.retailPrice != null ? formatMoney(r.retailPrice) : "-"}</td>
                <td className="p-2 text-right">{tp != null ? formatMoney(tp) : "-"}</td>
                <td className="p-2 text-right font-medium">{sub != null ? formatMoney(sub) : "-"}</td>
                <td className="p-2"><button onClick={() => removeRow(r.id)} className="text-red-400 text-xs hover:underline">删除</button></td>
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
            <thead className="bg-muted/50 border-b"><tr className="text-left">
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
                    <td className="p-2"><button onClick={() => removeRow(r.id)} className="text-red-400 text-xs hover:underline">删除</button></td>
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
        <thead className="bg-muted/50 border-b"><tr className="text-left">
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
                <td className="p-2"><button onClick={() => removeRow(r.id)} className="text-red-400 text-xs hover:underline">删除</button></td>
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
        <a href={row.drawingUrl} target="_blank" rel="noopener" className="text-sky-400 hover:underline truncate max-w-[140px]">📎 {row.drawingFileName}</a>
        <button onClick={() => clearDrawing(row.id)} className="text-red-400 hover:underline">移除</button>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <input type="file" accept=".pdf,.dwg,.step,.stp,application/pdf" disabled={row.drawingUploading}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDrawing(row.id, f); e.target.value = ""; }}
        className="text-xs w-44" />
      {row.drawingUploading && <div className="text-xs text-muted-foreground">上传中...</div>}
      {row.drawingError && <div className="text-xs text-red-400">{row.drawingError}</div>}
    </div>
  );
}
function Sel({ value, onChange, options, disabled, hideCode }: any) {
  // 选项里已有空码（无/本色、不限）时不再追加“请选择”，避免两个空值选项
  const hasEmptyOption = options.some((o: Option) => o.code === "");
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-8 border rounded px-2 text-sm bg-card min-w-[120px]">
      {!hasEmptyOption && <option value="">请选择</option>}
      {options.map((o: Option) => <option key={o.code} value={o.code}>{hideCode ? o.label : `${o.code} · ${o.label}`}</option>)}
    </select>
  );
}
function labelOf(opts: Option[], code: string): string {
  return opts.find((o) => o.code === code)?.label ?? code;
}
