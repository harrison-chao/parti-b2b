"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { toast } from "sonner";
import {
  distinctSeries, processCodesOf, colorCodesOf, variantsOf, resolveMaterial, materialHint, guessSeriesByCodes,
} from "@/lib/material-select";

/**
 * 内部代下单（W1/D6）：陈超/李奇莉把微信/电话接的单 60 秒录入系统。
 * 核心路径：选客户 → （复制历史订单 | 手动加行）→ 提交（免审、自动派单车间）。
 */

type Dealer = {
  id: string; dealerNo: string; companyName: string; nickname?: string | null;
  customerType?: "DEALER" | "WALK_IN"; contactName: string; contactPhone: string;
};
type Address = {
  id: string; receiverName: string; receiverPhone: string;
  province: string; city: string; district: string; detailAddress: string; isDefault: boolean;
  label?: string | null; addressType?: string | null;
};
type Product = {
  id: string; sku: string; productName: string; category: "PROFILE" | "HARDWARE";
  isRawMaterial?: boolean; series?: string | null; spec?: string | null; retailPrice: string;
  surfaceProcessCode?: string | null; surfaceColorCode?: string | null; materialStage?: string | null;
  lengthMm?: number | null;
};
type Option = { code: string; label: string };
type OrderLineRow = {
  key: string; lineType: "PROFILE" | "HARDWARE";
  series: string;
  rawProductId?: string; productId?: string; productName: string; sku: string;
  cutInch: string; cutMm: string; unit: "inch" | "mm"; quantity: string;
  processCodes: string[]; surfaceProcessCode: string; surfaceColorCode: string;
  unitPrice: number | null;
};
type ComboLine = {
  lineType: "PROFILE" | "HARDWARE"; rawProductId?: string | null; productId?: string | null;
  sku: string; productName: string; cutLengthMm?: number | null; processCodes: string[];
  surfaceProcessCode?: string | null; surfaceColorCode?: string | null; quantity: number;
};
type Combo = { id: string; name: string; lines: ComboLine[]; source: string; usageCount: number };
type RecentOrder = {
  orderNo: string; displayOrderNo?: string | null; createdAt: string;
  targetDeliveryDate: string; totalAmount: string; lines: { lineNo: number }[];
};

const j = async (res: Response) => (await res.json()).data;

export default function NewInternalOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const copyFrom = searchParams.get("copy");

  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [dealerId, setDealerId] = useState("");
  const [dealerQuery, setDealerQuery] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");
  // 代发场景：新填地址可回存客户地址簿（标签=终端客户名，dropship=代发直发）
  const [addrLabel, setAddrLabel] = useState("");
  const [addrType, setAddrType] = useState<"warehouse" | "dropship">("dropship");
  const [saveToBook, setSaveToBook] = useState(true);

  const [rawProducts, setRawProducts] = useState<Product[]>([]);
  const [hwProducts, setHwProducts] = useState<Product[]>([]);
  const [surfaceProcesses, setSurfaceProcesses] = useState<Option[]>([]);
  const [surfaceColors, setSurfaceColors] = useState<Option[]>([]);
  const [operations, setOperations] = useState<Option[]>([]);

  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date(Date.now() + 3 * 86400_000); // Base 实证：中位缓冲 3 天
    return d.toISOString().slice(0, 10);
  });
  const [priceNote, setPriceNote] = useState("");
  const [remark, setRemark] = useState("");
  const [rows, setRows] = useState<OrderLineRow[]>([]);
  const [recent, setRecent] = useState<RecentOrder[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [comboBusy, setComboBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const d = await j(await fetch("/api/dealers"));
      setDealers(d.dealers ?? []);
      const [rawR, hwR, settingsR] = await Promise.all([
        fetch("/api/products?category=PROFILE&activeOnly=1"),
        fetch("/api/products?category=HARDWARE&activeOnly=1"),
        fetch("/api/settings"),
      ]);
      const raw = (await j(await rawR)) as Product[];
      setRawProducts(raw.filter((p) => (p as any).isRawMaterial));
      setHwProducts(await j(await hwR));
      const st = await j(await settingsR);
      setSurfaceProcesses(st.surfaceProcesses ?? []);
      setSurfaceColors(st.surfaceColors ?? []);
      setOperations(st.processingOperations ?? []);
    })().catch((e) => setErr(String(e)));
  }, []);

  async function loadCombos() {
    const d = await j(await fetch("/api/combos"));
    let list: Combo[] = d.combos ?? [];
    if (!list.length) {
      await fetch("/api/combos/generate", { method: "POST" });
      const d2 = await j(await fetch("/api/combos"));
      list = d2.combos ?? [];
    }
    setCombos(list);
  }
  useEffect(() => { loadCombos().catch(() => null); }, []);

  function comboToRows(cl: ComboLine[]): OrderLineRow[] {
    return cl.map((l) => ({
      key: Math.random().toString(36).slice(2),
      lineType: l.lineType,
      ...hydrateProfile(l),
      productId: l.productId ?? undefined,
      cutMm: l.cutLengthMm ? String(l.cutLengthMm) : "",
      cutInch: l.cutLengthMm ? (l.cutLengthMm / 25.4).toFixed(1) : "",
      unit: "mm",
      quantity: String(l.quantity),
      processCodes: (l.processCodes ?? []).filter((c) => c !== "L"),
      unitPrice: null,
    }));
  }

  async function insertCombo(c: Combo) {
    const newRows = comboToRows(c.lines);
    setRows((rs) => [...rs, ...newRows]);
    for (const r of newRows) if (r.lineType === "PROFILE" && r.cutMm) void fetchPrice(r);
    void fetch(`/api/combos/${c.id}/use`, { method: "POST" });
    setMsg(`已插入「${c.name}」（${c.lines.length} 行），改数量后提交`);
    toast.success(`已插入「${c.name}」`);
  }

  async function saveCurrentAsCombo() {
    if (!rows.length) return setErr("当前没有明细可保存");
    setComboBusy(true);
    try {
      const lines = rows.map((r) => r.lineType === "PROFILE"
        ? { lineType: "PROFILE" as const, rawProductId: r.rawProductId ?? null, productId: null,
            sku: r.sku, productName: r.productName, cutLengthMm: r.cutMm ? Number(r.cutMm) : null,
            processCodes: ["L", ...r.processCodes], surfaceProcessCode: r.surfaceProcessCode,
            surfaceColorCode: r.surfaceColorCode, quantity: Number(r.quantity) || 1 }
        : { lineType: "HARDWARE" as const, rawProductId: null, productId: r.productId ?? null,
            sku: r.sku, productName: r.productName, cutLengthMm: null, processCodes: [],
            surfaceProcessCode: null, surfaceColorCode: null, quantity: Number(r.quantity) || 1 });
      const res = await fetch("/api/combos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }),
      });
      const rj = await res.json();
      if (!rj.ok) { toast.error(rj.message ?? "保存失败"); return setErr(rj.message ?? "保存失败"); }
      setMsg(`已存为常用组合「${rj.data.name}」`);
      toast.success(`已存为常用组合「${rj.data.name}」`);
      await loadCombos();
    } finally { setComboBusy(false); }
  }

  async function regenCombos() {
    setComboBusy(true);
    try {
      const d = await j(await fetch("/api/combos/generate", { method: "POST" }));
      setMsg(`从历史归集：新增 ${d.created} 个候选（跳过已存在 ${d.skipped}）`);
      await loadCombos();
    } finally { setComboBusy(false); }
  }

  async function delCombo(id: string) {
    await fetch(`/api/combos/${id}`, { method: "DELETE" });
    await loadCombos();
  }

  // 选客户 → 拉地址与最近订单
  useEffect(() => {
    if (!dealerId) return;
    (async () => {
      const a = await j(await fetch(`/api/dealers/${dealerId}/addresses`));
      setAddresses(a.addresses ?? []);
      const def = (a.addresses ?? [])[0];
      if (def) applyAddress(def);
      const o = await j(await fetch(`/api/orders?dealerId=${dealerId}&pageSize=8`));
      setRecent(o.orders ?? []);
    })().catch((e) => setErr(String(e)));
  }, [dealerId]);

  // ?copy=orderNo → 载入历史订单
  useEffect(() => {
    if (!copyFrom) return;
    (async () => {
      const o = await j(await fetch(`/api/orders/${copyFrom}`));
      if (!o) return setErr("复制来源订单不存在");
      setDealerId(o.dealerId);
      setReceiverName(o.receiverName); setReceiverPhone(o.receiverPhone); setReceiverAddress(o.receiverAddress);
      setRemark(o.remark ?? ""); setPriceNote(o.priceNote ?? "");
      setRows((o.lines ?? []).filter((l: any) => l.lineType !== "OUTSOURCED").map((l: any) => ({
        key: Math.random().toString(36).slice(2),
        lineType: l.lineType,
        ...hydrateProfile({
          rawProductId: l.rawProductId ?? null,
          sku: l.sku, productName: l.productName,
          // 旧 surfaceTreatment 可能是 Base 原文（如"Pink粉色-水漆"），只有形如 码-码 才回拆
          ...parseLegacySurface(l.surfaceTreatment, l.surfaceProcessCode, l.surfaceColorCode),
        }),
        productId: l.productId ?? undefined,
        cutMm: l.cutLengthMm ? String(l.cutLengthMm) : "",
        cutInch: l.cutLengthMm ? (l.cutLengthMm / 25.4).toFixed(1) : "",
        unit: "mm",
        quantity: String(l.quantity),
        processCodes: l.processCodes?.length ? l.processCodes : guessProcessCodes(l),
        unitPrice: Number(l.unitPrice),
      })));
      setMsg(`已载入订单 ${o.displayOrderNo ?? o.orderNo} 的 ${o.lines?.length ?? 0} 行，可直接改数量提交`);
    })().catch((e) => setErr(String(e)));
  }, [copyFrom]);

  function guessProcessCodes(l: any): string[] {
    const codes: string[] = [];
    const pre = l.preprocessing ?? "";
    if (pre.includes("销子孔") || pre.includes("铣")) codes.push("D");
    if (pre.includes("预埋")) codes.push("EM");
    return codes;
  }

  // 旧 surfaceTreatment 只在形如「A-SV」（各 1-8 位码）时才回拆成双码；Base 中文原文直接落默认，不产垃圾码
  function parseLegacySurface(legacy: string | null | undefined, codeP?: string | null, codeC?: string | null) {
    if (codeP || codeC) return { surfaceProcessCode: codeP ?? "", surfaceColorCode: codeC ?? "" };
    const m = typeof legacy === "string" ? legacy.trim().match(/^([A-Z]{1,8})-([A-Z0-9]{1,8})$/) : null;
    return m
      ? { surfaceProcessCode: m[1], surfaceColorCode: m[2] }
      : { surfaceProcessCode: "", surfaceColorCode: "" };
  }

  function applyAddress(a: Address) {
    setAddressId(a.id);
    setReceiverName(a.receiverName);
    setReceiverPhone(a.receiverPhone);
    setReceiverAddress(`${a.province}${a.city}${a.district}${a.detailAddress}`);
  }

  const selectedDealer = useMemo(() => dealers.find((d) => d.id === dealerId), [dealers, dealerId]);
  const { dealerList, directList } = useMemo(() => {
    const q = dealerQuery.trim().toLowerCase();
    const match = (d: typeof dealers[number]) =>
      !q || [d.companyName, d.nickname ?? "", d.dealerNo, d.contactName, d.contactPhone]
        .some((f) => f.toLowerCase().includes(q));
    const isDirect = (d: typeof dealers[number]) => d.customerType === "WALK_IN";
    return {
      dealerList: dealers.filter((d) => !isDirect(d) && match(d)),
      directList: dealers.filter((d) => isDirect(d) && match(d)).slice(0, q ? 12 : 15),
    };
  }, [dealers, dealerQuery]);

  function addProfileRow() {
    const raw = rawProducts[0];
    if (!raw) return setErr("型材库无原料型材，请先在产品目录维护");
    setRows((rs) => [...rs, {
      key: Math.random().toString(36).slice(2), lineType: "PROFILE",
      series: raw.series ?? "",
      rawProductId: raw.id, productName: raw.productName, sku: raw.sku,
      cutInch: "13", cutMm: "330", unit: "inch", quantity: "10",
      processCodes: ["D", "EM"], // Base 实证默认：铣孔 82% / 预埋 77%
      surfaceProcessCode: raw.surfaceProcessCode ?? "A",
      surfaceColorCode: raw.surfaceColorCode ?? "SV",
      unitPrice: null,
    }]);
  }
  function addHwRow() {
    const hw = hwProducts[0];
    if (!hw) return setErr("五金目录为空");
    setRows((rs) => [...rs, {
      key: Math.random().toString(36).slice(2), lineType: "HARDWARE",
      series: "",
      productId: hw.id, productName: hw.productName, sku: hw.sku,
      cutInch: "", cutMm: "", unit: "mm", quantity: "10",
      processCodes: [], surfaceProcessCode: "", surfaceColorCode: "",
      unitPrice: Number(hw.retailPrice),
    }]);
  }
  function patchRow(key: string, patch: Partial<OrderLineRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function setCut(r: OrderLineRow, val: string, unit: "inch" | "mm") {
    // 寸/mm 任意填一个，另一个自动换算
    if (unit === "inch") {
      const mm = val ? String(Math.round(parseFloat(val) * 25.4)) : "";
      patchRow(r.key, { cutInch: val, cutMm: mm, unit });
    } else {
      const inch = val ? (parseFloat(val) / 25.4).toFixed(1) : "";
      patchRow(r.key, { cutMm: val, cutInch: inch, unit });
    }
  }
  function toggleProcess(r: OrderLineRow, code: string) {
    patchRow(r.key, {
      processCodes: r.processCodes.includes(code)
        ? r.processCodes.filter((c) => c !== code)
        : [...r.processCodes, code],
    });
  }

  function labelOfOpt(opts: Option[], code: string) {
    return code ? (opts.find((o) => o.code === code)?.label ?? code) : "无/本色";
  }
  function colorLabelOf(code: string) {
    return code ? (surfaceColors.find((o) => o.code === code)?.label ?? code) : "不限";
  }
  // 三步级联：型材 → 表面处理 → 颜色，解析出内部原料 SKU（棒长/编码不暴露给下单人）
  function rowPatch(series: string, processCode: string, colorCode: string): Partial<OrderLineRow> {
    const m = resolveMaterial(rawProducts, series, processCode, colorCode);
    return {
      series, surfaceProcessCode: processCode, surfaceColorCode: colorCode,
      rawProductId: m?.id,
      ...(m ? { sku: m.sku, productName: m.productName ?? "" } : {}),
    };
  }
  // 历史/组合行回填：优先按 rawProductId 定位；旧行无指针时凭双码唯一定位系列
  function hydrateProfile(l: {
    rawProductId?: string | null; sku?: string | null; productName?: string | null;
    surfaceProcessCode?: string | null; surfaceColorCode?: string | null;
  }): Pick<OrderLineRow, "series" | "rawProductId" | "sku" | "productName" | "surfaceProcessCode" | "surfaceColorCode"> {
    const raw = l.rawProductId ? rawProducts.find((p) => p.id === l.rawProductId) : undefined;
    if (raw) {
      return {
        series: raw.series ?? "", rawProductId: raw.id, sku: raw.sku, productName: raw.productName,
        surfaceProcessCode: raw.surfaceProcessCode ?? "", surfaceColorCode: raw.surfaceColorCode ?? "",
      };
    }
    const p = (l.surfaceProcessCode ?? "").trim(), c = (l.surfaceColorCode ?? "").trim();
    const s = guessSeriesByCodes(rawProducts, p, c) ?? "";
    const m = s ? resolveMaterial(rawProducts, s, p, c) : null;
    return {
      series: s, rawProductId: m?.id ?? (l.rawProductId ?? undefined),
      sku: m?.sku ?? l.sku ?? "", productName: m?.productName ?? l.productName ?? "",
      surfaceProcessCode: p, surfaceColorCode: c,
    };
  }

  async function fetchPrice(r: OrderLineRow) {
    if (r.lineType !== "PROFILE" || !r.cutMm) return;
    // 带原料 SKU 级口径计价（米重/良率/每米价三级回退）
    const qs = r.rawProductId ? `&rawProductId=${r.rawProductId}` : "";
    const res = await fetch(`/api/pricing/calculate?lengthMm=${r.cutMm}${qs}`);
    const d = await j(await res);
    if (d?.dealerPrice != null) patchRow(r.key, { unitPrice: d.dealerPrice });
  }

  async function copyRecent(orderNo: string) {
    const o = await j(await fetch(`/api/orders/${orderNo}`));
    if (!o) return;
    setReceiverName(o.receiverName); setReceiverPhone(o.receiverPhone); setReceiverAddress(o.receiverAddress);
    setRemark(o.remark ?? "");
    setRows((o.lines ?? []).filter((l: any) => l.lineType !== "OUTSOURCED").map((l: any) => ({
      key: Math.random().toString(36).slice(2), lineType: l.lineType,
      ...hydrateProfile({
        rawProductId: l.rawProductId ?? null,
        sku: l.sku, productName: l.productName,
        ...parseLegacySurface(l.surfaceTreatment, l.surfaceProcessCode, l.surfaceColorCode),
      }),
      productId: l.productId ?? undefined,
      cutMm: l.cutLengthMm ? String(l.cutLengthMm) : "", cutInch: l.cutLengthMm ? (l.cutLengthMm / 25.4).toFixed(1) : "",
      unit: "mm", quantity: String(l.quantity),
      processCodes: l.processCodes?.length ? l.processCodes : guessProcessCodes(l),
      unitPrice: Number(l.unitPrice),
    })));
    setMsg(`已复制 ${o.displayOrderNo ?? o.orderNo}（${(o.lines ?? []).length} 行），改数量即可提交`);
  }

  async function submit() {
    setErr(null); setMsg(null);
    if (!dealerId) return setErr("请选择客户");
    if (!rows.length) return setErr("请至少添加一行明细");
    if (!receiverName || !receiverPhone || !receiverAddress) return setErr("收货信息不完整");
    for (const r of rows) {
      if (!r.quantity || Number(r.quantity) <= 0) return setErr(`${r.productName || r.series || "明细行"} 数量无效`);
      if (r.lineType === "PROFILE" && (!r.cutMm || Number(r.cutMm) <= 0)) return setErr(`${r.productName} 缺切长`);
      if (r.lineType === "PROFILE" && !r.rawProductId) return setErr(`${r.series || "型材行"}：请选完型材、表面处理、颜色以匹配原料`);
    }
    const lines = rows.map((r) => {
      if (r.lineType === "PROFILE") {
        return {
          lineType: "PROFILE", sku: r.sku, productName: r.productName,
          rawProductId: r.rawProductId, cutLengthMm: Number(r.cutMm),
          processCodes: ["L", ...r.processCodes], // 截断为隐含工序
          surfaceProcessCode: r.surfaceProcessCode || null,
          surfaceColorCode: r.surfaceColorCode || null,
          surfaceTreatment: r.surfaceProcessCode
            ? [r.surfaceProcessCode, r.surfaceColorCode].filter(Boolean).join("-")
            : null,
          quantity: Number(r.quantity), unitPrice: r.unitPrice ?? 0,
        };
      }
      const hw = hwProducts.find((p) => p.id === r.productId)!;
      return {
        lineType: "HARDWARE", sku: r.sku, productName: r.productName,
        productId: r.productId, quantity: Number(r.quantity), unitPrice: Number(hw.retailPrice),
      };
    });
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealerId, targetDeliveryDate: targetDate,
          receiverName, receiverPhone, receiverAddress, remark, priceNote, lines,
        }),
      });
      const rj = await res.json();
      if (!rj.ok) { toast.error(rj.message ?? "创建失败"); return setErr(rj.message ?? "创建失败"); }
      toast.success(`订单 ${rj.data.displayOrderNo ?? rj.data.orderNo} 已创建${rj.data.autoDispatchedWorkOrderNo ? "，已派车间" : ""}`);
      if (saveToBook && dealerId && receiverName && receiverPhone && receiverAddress) {
        void fetch(`/api/dealers/${dealerId}/addresses`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receiverName, receiverPhone, detailAddress: receiverAddress,
            label: addrLabel || null, addressType: addrType,
          }),
        });
      }
      if (rj.data.dispatchWarning) toast.warning(rj.data.dispatchWarning, { duration: 8000 });
      if (rj.data.materialWarning) toast.warning(rj.data.materialWarning, { duration: 10000 });
      router.push(`/admin/orders/${rj.data.orderNo}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4 stagger-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">内部代下单</h1>
        <Badge className="bg-teal-500/15 text-teal-300 ring-1 ring-inset ring-teal-400/20">免审 · 提交即派车间</Badge>
      </div>
      {err && <div className="bg-destructive/10 border border-red-200 text-red-400 rounded p-3 text-sm">{err}</div>}
      {msg && <div className="bg-emerald-500/10 border border-emerald-200 text-emerald-300 rounded p-3 text-sm">{msg}</div>}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">① 客户</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-full border rounded p-2 text-left text-sm flex items-center justify-between hover:bg-secondary">
                {dealerId
                  ? <span className="flex items-center gap-2">
                      <span>{selectedDealer ? (selectedDealer.nickname || selectedDealer.companyName) : "…"}</span>
                      {selectedDealer?.customerType === "WALK_IN"
                        ? <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[11px] text-cyan-300 ring-1 ring-inset ring-cyan-400/20">直销客户</span>
                        : selectedDealer && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] text-blue-300 ring-1 ring-inset ring-blue-400/20">经销商</span>}
                      {selectedDealer && <span className="text-xs text-muted-foreground font-mono">{selectedDealer.dealerNo}</span>}
                    </span>
                  : <span className="text-muted-foreground">点击选择客户（可搜名称/收货人/编号/电话）</span>}
                <span className="text-gray-300">▼</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="搜索客户…" value={dealerQuery} onValueChange={setDealerQuery} />
                <CommandList>
                  <CommandEmpty>无匹配客户，先到「客户管理」页建档（可选经销商或直销客户）</CommandEmpty>
                  {dealerList.length > 0 && (
                    <CommandGroup heading="经销商">
                      {dealerList.map((d) => (
                        <CommandItem key={d.id} value={`${d.companyName} ${d.nickname ?? ""} ${d.dealerNo} ${d.contactName} ${d.contactPhone}`}
                          onSelect={() => { setDealerId(d.id); setDealerQuery(""); }}>
                          {d.companyName}
                          <span className="ml-auto text-xs text-muted-foreground font-mono">{d.dealerNo}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {directList.length > 0 && (
                    <CommandGroup heading="直销客户">
                      {directList.map((d) => (
                        <CommandItem key={d.id} value={`${d.companyName} ${d.nickname ?? ""} ${d.dealerNo} ${d.contactName} ${d.contactPhone}`}
                          onSelect={() => { setDealerId(d.id); setDealerQuery(""); }}>
                          {d.nickname || d.companyName}
                          <span className="ml-auto max-w-[45%] truncate text-xs text-muted-foreground" title={d.companyName}>{d.nickname ? d.companyName : ""}</span>
                          <span className="ml-2 text-xs text-muted-foreground font-mono">{d.dealerNo}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {dealerId && recent.length > 0 && (
            <div className="pt-2">
              <Label className="text-xs text-muted-foreground">复制历史订单（改数量即下单）</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {recent.map((o) => (
                  <button key={o.orderNo} onClick={() => copyRecent(o.orderNo)}
                    className="border rounded px-2 py-1 text-xs hover:bg-secondary">
                    {o.displayOrderNo ?? o.orderNo.slice(-6)} · {o.lines?.length ?? 0}行 · {new Date(o.targetDeliveryDate).toLocaleDateString()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">② 收货与交期</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          {addresses.length > 0 && (
            <div className="md:col-span-2 flex flex-wrap gap-2">
              {addresses.map((a) => (
                <button key={a.id} onClick={() => applyAddress(a)}
                  className={`border rounded px-2 py-1 text-xs ${addressId === a.id ? "border-blue-500 bg-sky-500/10" : "hover:bg-secondary"}`}>
                  {a.addressType === "dropship" && <span className="text-cyan-300 mr-1">[代发]</span>}
                  {a.label && <span className="font-medium mr-1">{a.label} · </span>}
                  {a.province}{a.city}{a.district} · {a.receiverName}
                </button>
              ))}
            </div>
          )}
          <div><Label>收货人</Label><Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} /></div>
          <div><Label>电话</Label><Input value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} /></div>
          <div className="md:col-span-2"><Label>收货地址</Label><Input value={receiverAddress} onChange={(e) => setReceiverAddress(e.target.value)} /></div>
          <div className="md:col-span-2 flex flex-wrap items-end gap-3 border-t pt-2">
            <div className="w-44"><Label className="text-xs">地址标签（终端客户）</Label><Input value={addrLabel} onChange={(e) => setAddrLabel(e.target.value)} placeholder="如 代发·杭州万象城店" /></div>
            <div>
              <Label className="text-xs">地址类型</Label>
              <select className="h-10 border rounded px-2 text-sm bg-card" value={addrType} onChange={(e) => setAddrType(e.target.value as "warehouse" | "dropship")}>
                <option value="dropship">代发（直发他的客户）</option>
                <option value="warehouse">自用（发客户本人）</option>
              </select>
            </div>
            <label className="flex items-center gap-1.5 text-sm pb-2">
              <input type="checkbox" checked={saveToBook} onChange={(e) => setSaveToBook(e.target.checked)} />
              保存到该客户地址簿
            </label>
          </div>
          <div><Label>目标交期</Label><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></div>
          <div><Label>价格备注（实价与报价差异，可选）</Label><Input value={priceNote} onChange={(e) => setPriceNote(e.target.value)} placeholder="如：微信已收 300" /></div>
          <div className="md:col-span-2"><Label>备注</Label><Input value={remark} onChange={(e) => setRemark(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">常用组合（{combos.length}）</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={comboBusy} onClick={saveCurrentAsCombo}>存当前明细</Button>
              <Button variant="outline" size="sm" disabled={comboBusy} onClick={regenCombos}>从历史生成</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {combos.map((c) => (
              <span key={c.id} className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs flex items-center gap-1 spring-press">
                <button className="hover:bg-sky-500/10 rounded px-1" onClick={() => insertCombo(c)} title="一键插入明细">
                  {c.source === "auto-history" ? "📋 " : "⭐ "}{c.name}
                  {c.usageCount > 0 && <span className="text-muted-foreground"> ·{c.usageCount}</span>}
                </button>
                <button className="text-gray-300 hover:text-red-500" onClick={() => delCombo(c.id)} title="删除">×</button>
              </span>
            ))}
            {!combos.length && !comboBusy && <span className="text-xs text-muted-foreground">暂无组合——点「从历史生成」归集高频规格，或填好明细后「存当前明细」</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">③ 明细（{rows.length} 行）</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addProfileRow}>+ 型材切长</Button>
              <Button variant="outline" size="sm" onClick={addHwRow}>+ 五金</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="border rounded p-3 grid gap-2 md:grid-cols-12 items-end">
              {r.lineType === "PROFILE" ? (
                <>
                  <div className="md:col-span-3">
                    <Label className="text-xs">型材</Label>
                    <select className="w-full border rounded p-2 text-sm" value={r.series}
                      onChange={(e) => {
                        const s = e.target.value;
                        const proc = processCodesOf(rawProducts, s)[0] ?? "";
                        const col = colorCodesOf(rawProducts, s, proc)[0] ?? "";
                        const patch = rowPatch(s, proc, col);
                        patchRow(r.key, patch);
                        const next = { ...r, ...patch } as OrderLineRow;
                        if (next.rawProductId && next.cutMm) void fetchPrice(next);
                      }}>
                      <option value="">选择型材</option>
                      {distinctSeries(rawProducts).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <div className="text-xs text-muted-foreground mt-0.5 min-h-[1em]">
                      {(() => {
                        const m = rawProducts.find((x) => x.id === r.rawProductId);
                        if (!m) return r.series ? "选完表面/颜色后自动匹配原料" : "";
                        return (
                          <span>
                            {m.materialStage === "SEMI" && <span className="text-amber-300 mr-1">[半成品段]</span>}
                            已匹配 {materialHint(m)}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">切长（寸 / mm 任意填一个）</Label>
                    <div className="flex gap-1">
                      <div className="relative flex-1">
                        <Input type="number" step="0.1" value={r.cutInch} className="pr-7"
                          onChange={(e) => setCut(r, e.target.value, "inch")} onBlur={() => fetchPrice(r)} />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">寸</span>
                      </div>
                      <div className="relative flex-1">
                        <Input type="number" step="1" value={r.cutMm} className="pr-7"
                          onChange={(e) => setCut(r, e.target.value, "mm")} onBlur={() => fetchPrice(r)} />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">mm</span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.cutMm ? `${r.cutInch || "?"}寸 = ${r.cutMm}mm` : "填寸或mm，另一个自动换算"}
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">工序</Label>
                    <div className="flex flex-wrap gap-2">
                      {operations.filter((o) => o.code !== "L").map((o) => (
                        <label key={o.code} className="flex items-center gap-1 text-sm">
                          <input type="checkbox" checked={r.processCodes.includes(o.code)} onChange={() => toggleProcess(r, o.code)} />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">表面处理 / 颜色</Label>
                    <div className="flex gap-1">
                      <select className="w-1/2 border rounded p-2 text-sm" value={r.surfaceProcessCode}
                        onChange={(e) => {
                          const proc = e.target.value;
                          const col = colorCodesOf(rawProducts, r.series, proc)[0] ?? "";
                          const patch = rowPatch(r.series, proc, col);
                          patchRow(r.key, patch);
                          const next = { ...r, ...patch } as OrderLineRow;
                          if (next.rawProductId && next.cutMm) void fetchPrice(next);
                        }}>
                        {processCodesOf(rawProducts, r.series).map((c) => (
                          <option key={c} value={c}>{labelOfOpt(surfaceProcesses, c)}</option>
                        ))}
                      </select>
                      <select className="w-1/2 border rounded p-2 text-sm" value={r.surfaceColorCode}
                        onChange={(e) => {
                          const patch = rowPatch(r.series, r.surfaceProcessCode, e.target.value);
                          patchRow(r.key, patch);
                          const next = { ...r, ...patch } as OrderLineRow;
                          if (next.rawProductId && next.cutMm) void fetchPrice(next);
                        }}>
                        {colorCodesOf(rawProducts, r.series, r.surfaceProcessCode).map((c) => (
                          <option key={c} value={c}>{colorLabelOf(c)}</option>
                        ))}
                      </select>
                    </div>
                    {variantsOf(rawProducts, r.series, r.surfaceProcessCode, r.surfaceColorCode).length > 1 && (
                      <select className="w-full border rounded p-1 text-xs mt-1" value={r.rawProductId}
                        onChange={(e) => {
                          const m = rawProducts.find((x) => x.id === e.target.value)!;
                          patchRow(r.key, { rawProductId: m.id, sku: m.sku, productName: m.productName });
                          void fetchPrice({ ...r, rawProductId: m.id });
                        }}>
                        {variantsOf(rawProducts, r.series, r.surfaceProcessCode, r.surfaceColorCode).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.materialStage === "SEMI" ? `${(m.lengthMm ?? 0) / 1000}m 半成品段` : `${(m.lengthMm ?? 0) / 1000}m 备料棒`}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </>
              ) : (
                <div className="md:col-span-8">
                  <Label className="text-xs">五金</Label>
                  <select className="w-full border rounded p-2 text-sm" value={r.productId}
                    onChange={(e) => {
                      const p = hwProducts.find((x) => x.id === e.target.value)!;
                      patchRow(r.key, { productId: p.id, productName: p.productName, sku: p.sku, unitPrice: Number(p.retailPrice) });
                    }}>
                    {hwProducts.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.productName}</option>)}
                  </select>
                </div>
              )}
              <div className="md:col-span-1">
                <Label className="text-xs">数量</Label>
                <Input value={r.quantity} onChange={(e) => patchRow(r.key, { quantity: e.target.value })} />
              </div>
              <div className="md:col-span-1 flex flex-col items-end gap-1">
                <div className="text-sm">{r.unitPrice != null ? `¥${r.unitPrice}` : "—"}</div>
                <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>删除</Button>
              </div>
            </div>
          ))}
          {!rows.length && <div className="text-sm text-muted-foreground">还没有明细。选「复制历史订单」最快，或手动加行。</div>}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-8">
        <Button disabled={submitting} onClick={submit}>{submitting ? "提交中…" : "提交（免审·自动派车间）"}</Button>
      </div>
    </div>
  );
}
