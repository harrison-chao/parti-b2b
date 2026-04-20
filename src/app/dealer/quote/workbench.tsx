"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/utils";
import { genCustomSku, genCustomProductName } from "@/lib/options";

type Option = { code: string; label: string };
type Address = { id: string; receiverName: string; receiverPhone: string; fullAddress: string; isDefault: boolean };

type Row = {
  id: string;
  lengthMm: string;
  processCode: string;
  colorCode: string;
  operationCode: string;
  modifier: string;
  quantity: number;
  targetPct: string;
  unitPrice: number | null;
  retailPrice: number | null;
  loading: boolean;
  error?: string;
};

function newRow(): Row {
  return {
    id: crypto.randomUUID(),
    lengthMm: "",
    processCode: "",
    colorCode: "",
    operationCode: "",
    modifier: "",
    quantity: 1,
    targetPct: "",
    unitPrice: null,
    retailPrice: null,
    loading: false,
  };
}

function rowTargetPrice(r: Row): number | null {
  if (!r.retailPrice || !r.targetPct) return null;
  const pct = parseFloat(r.targetPct);
  if (!pct) return null;
  return r.retailPrice * (pct / 100);
}

function rowReady(r: Row): boolean {
  return !!(r.lengthMm && r.processCode && r.colorCode && r.operationCode && r.unitPrice);
}

export function QuoteWorkbench({
  dealer,
  addresses,
  options,
}: {
  dealer: { id: string; companyName: string; priceLevel: string; paymentMethod: string; creditBalance: number };
  addresses: Address[];
  options: { surfaceProcesses: Option[]; surfaceColors: Option[]; processingOperations: Option[] };
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [addrId, setAddrId] = useState(addresses[0]?.id ?? "");
  const [newAddr, setNewAddr] = useState({ receiverName: "", receiverPhone: "", receiverAddress: "" });
  const [useNewAddr, setUseNewAddr] = useState(addresses.length === 0);
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function patchRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function recalc(id: string, lengthMm: number) {
    patchRow(id, { loading: true, error: undefined });
    try {
      const r = await fetch(`/api/pricing/calculate?lengthMm=${lengthMm}`);
      const j = await r.json();
      if (j.code !== 0) {
        patchRow(id, { loading: false, error: j.message, unitPrice: null, retailPrice: null });
        return;
      }
      patchRow(id, {
        loading: false,
        unitPrice: j.data.dealerPrice,
        retailPrice: j.data.retailPrice,
      });
    } catch (e: any) {
      patchRow(id, { loading: false, error: e?.message ?? "计算失败" });
    }
  }

  function onLengthBlur(r: Row) {
    const mm = parseFloat(r.lengthMm);
    if (mm > 0) recalc(r.id, mm);
  }

  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }
  function removeRow(id: string) {
    setRows((rs) => (rs.length === 1 ? [newRow()] : rs.filter((r) => r.id !== id)));
  }

  const readyRows = useMemo(() => rows.filter(rowReady), [rows]);
  const total = useMemo(() => readyRows.reduce((s, r) => s + (r.unitPrice ?? 0) * r.quantity, 0), [readyRows]);
  const targetTotal = useMemo(
    () => readyRows.reduce((s, r) => s + ((rowTargetPrice(r) ?? r.unitPrice ?? 0)) * r.quantity, 0),
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
      receiverName = newAddr.receiverName;
      receiverPhone = newAddr.receiverPhone;
      receiverAddress = newAddr.receiverAddress;
    } else {
      const a = addresses.find((x) => x.id === addrId);
      if (!a) return setError("请选择收货地址");
      receiverName = a.receiverName;
      receiverPhone = a.receiverPhone;
      receiverAddress = a.fullAddress;
    }
    if (creditInsufficient) return setError(`信用额度不足（可用 ${formatMoney(dealer.creditBalance)}）`);

    const lines = readyRows.map((r) => {
      const mm = parseFloat(r.lengthMm);
      const surfaceCode = `${r.processCode}-${r.colorCode}`;
      const surfaceLabelText = labelOf(options.surfaceProcesses, r.processCode) + "/" + labelOf(options.surfaceColors, r.colorCode);
      const processingCode = r.operationCode + (r.modifier ? r.modifier.trim().toUpperCase() : "");
      const processingLabelText = labelOf(options.processingOperations, r.operationCode) + (r.modifier ? ` ${r.modifier}` : "");
      const sku = genCustomSku("MR2525", mm, surfaceCode, processingCode);
      const productName = genCustomProductName("MR2525", mm, surfaceLabelText);
      const tp = rowTargetPrice(r);
      return {
        sku,
        productName,
        lengthMm: mm,
        surfaceTreatment: surfaceCode,
        preprocessing: processingLabelText,
        quantity: r.quantity,
        unitPrice: r.unitPrice!,
        targetPrice: tp ?? null,
        isCustom: true,
      };
    });

    setSubmitting(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDeliveryDate: targetDate, receiverName, receiverPhone, receiverAddress, remark, lines }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      const orderNo = j.data.orderNo;
      if (submitAfter) await fetch(`/api/orders/${orderNo}/submit`, { method: "POST" });
      router.push(`/dealer/orders/${orderNo}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">报价下单 · {dealer.companyName}</h1>
        <div className="text-sm text-muted-foreground">等级 {dealer.priceLevel}</div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>报价计算（可多行）</CardTitle>
          <Button size="sm" variant="outline" onClick={addRow}>+ 添加一行</Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead className="bg-slate-50 border-b">
              <tr className="text-left">
                <th className="p-2">长度(mm)</th>
                <th className="p-2">表面工艺</th>
                <th className="p-2">颜色</th>
                <th className="p-2">加工操作</th>
                <th className="p-2">修饰</th>
                <th className="p-2 w-20">数量</th>
                <th className="p-2 w-24">目标%</th>
                <th className="p-2 text-right">采购单价</th>
                <th className="p-2 text-right">零售价</th>
                <th className="p-2 text-right">目标售价</th>
                <th className="p-2 text-right">单根毛利</th>
                <th className="p-2 text-right">小计</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tp = rowTargetPrice(r);
                const profit = tp != null && r.unitPrice != null ? tp - r.unitPrice : null;
                const sub = r.unitPrice != null ? r.unitPrice * r.quantity : null;
                return (
                  <tr key={r.id} className="border-b">
                    <td className="p-2">
                      <Input type="number" min={1} className="h-8 w-24" value={r.lengthMm}
                        onChange={(e) => patchRow(r.id, { lengthMm: e.target.value })}
                        onBlur={() => onLengthBlur(r)} />
                    </td>
                    <td className="p-2">
                      <Select value={r.processCode} onChange={(v) => patchRow(r.id, { processCode: v })} options={options.surfaceProcesses} />
                    </td>
                    <td className="p-2">
                      <Select value={r.colorCode} onChange={(v) => patchRow(r.id, { colorCode: v })} options={options.surfaceColors} />
                    </td>
                    <td className="p-2">
                      <Select value={r.operationCode} onChange={(v) => patchRow(r.id, { operationCode: v })} options={options.processingOperations} />
                    </td>
                    <td className="p-2">
                      <Input className="h-8 w-28" placeholder="如 600MM" value={r.modifier}
                        onChange={(e) => patchRow(r.id, { modifier: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" min={1} className="h-8 w-16" value={r.quantity}
                        onChange={(e) => patchRow(r.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" className="h-8 w-20" placeholder="90" value={r.targetPct}
                        onChange={(e) => patchRow(r.id, { targetPct: e.target.value })} />
                    </td>
                    <td className="p-2 text-right">
                      {r.loading ? "..." : r.error ? <span className="text-red-600 text-xs">{r.error}</span> : r.unitPrice != null ? formatMoney(r.unitPrice) : "-"}
                    </td>
                    <td className="p-2 text-right text-muted-foreground">{r.retailPrice != null ? formatMoney(r.retailPrice) : "-"}</td>
                    <td className="p-2 text-right">{tp != null ? formatMoney(tp) : "-"}</td>
                    <td className={`p-2 text-right ${profit == null ? "" : profit >= 0 ? "text-blue-700" : "text-red-600"}`}>
                      {profit != null ? formatMoney(profit) : "-"}
                    </td>
                    <td className="p-2 text-right font-medium">{sub != null ? formatMoney(sub) : "-"}</td>
                    <td className="p-2">
                      <button onClick={() => removeRow(r.id)} className="text-red-600 text-xs hover:underline">删除</button>
                    </td>
                  </tr>
                );
              })}
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
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={!useNewAddr} onChange={() => setUseNewAddr(false)} /> 使用已有地址
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={useNewAddr} onChange={() => setUseNewAddr(true)} /> 新填地址
                  </label>
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
              <div><Label>订单备注</Label><Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="整单级别备注" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>金额汇总</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span>有效行数</span><span>{readyRows.length}</span></div>
              <div className="flex justify-between text-sm"><span>合计数量</span><span>{readyRows.reduce((s, r) => s + r.quantity, 0)} 根</span></div>
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

function labelOf(opts: Option[], code: string): string {
  return opts.find((o) => o.code === code)?.label ?? code;
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Option[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="h-8 border rounded px-2 text-sm bg-white min-w-[120px]">
      <option value="">请选择</option>
      {options.map((o) => (
        <option key={o.code} value={o.code}>{o.code} · {o.label}</option>
      ))}
    </select>
  );
}
