"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/utils";

type Product = {
  sku: string;
  productName: string;
  series: string;
  lengthMm: number;
  lengthInch: number;
  retailPrice: number;
  dealerPrice: number;
};

type Address = { id: string; receiverName: string; receiverPhone: string; fullAddress: string; isDefault: boolean };

type Line = { sku: string; productName: string; unitPrice: number; quantity: number; surfaceTreatment?: string; preprocessing?: string };

export function NewOrderForm({
  dealer,
  addresses,
  products,
}: {
  dealer: { id: string; companyName: string; priceLevel: string; paymentMethod: string; creditBalance: number };
  addresses: Address[];
  products: Product[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [addrId, setAddrId] = useState<string>(addresses[0]?.id ?? "");
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

  function addLine(p: Product) {
    setLines((ls) => {
      const existing = ls.findIndex((l) => l.sku === p.sku);
      if (existing >= 0) {
        const copy = [...ls];
        copy[existing] = { ...copy[existing], quantity: copy[existing].quantity + 1 };
        return copy;
      }
      return [...ls, { sku: p.sku, productName: p.productName, unitPrice: p.dealerPrice, quantity: 1 }];
    });
  }
  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx: number) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  const total = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0), [lines]);
  const creditInsufficient = dealer.paymentMethod === "CREDIT" && total > dealer.creditBalance;

  async function submit(submitAfter: boolean) {
    setError("");
    if (lines.length === 0) return setError("请至少添加一个产品");
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

    setSubmitting(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetDeliveryDate: targetDate,
          receiverName, receiverPhone, receiverAddress,
          remark,
          lines: lines.map((l) => ({
            sku: l.sku, productName: l.productName,
            surfaceTreatment: l.surfaceTreatment, preprocessing: l.preprocessing,
            quantity: l.quantity, unitPrice: l.unitPrice,
          })),
        }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      const orderNo = j.data.orderNo;
      if (submitAfter) {
        await fetch(`/api/orders/${orderNo}/submit`, { method: "POST" });
      }
      router.push(`/dealer/orders/${orderNo}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">创建订单</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>选择产品</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {products.map((p) => (
                  <button
                    key={p.sku}
                    onClick={() => addLine(p)}
                    className="text-left border rounded p-3 hover:bg-slate-50 hover:border-slate-400 transition"
                  >
                    <div className="font-medium text-sm">{p.productName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{p.sku}</div>
                    <div className="text-sm text-emerald-700 font-semibold mt-1">{formatMoney(p.dealerPrice)} / 根</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>订单明细</CardTitle></CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4">请从上方选择产品</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b"><tr className="text-left">
                    <th className="pb-2">产品</th><th className="pb-2">加工</th><th className="pb-2 w-24">数量</th>
                    <th className="pb-2 w-24 text-right">单价</th><th className="pb-2 w-24 text-right">小计</th><th></th>
                  </tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2">
                          <div className="text-sm font-medium">{l.productName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{l.sku}</div>
                        </td>
                        <td className="py-2">
                          <Input className="h-8 text-xs" placeholder="如 L600MM-DE"
                            value={l.preprocessing ?? ""} onChange={(e) => updateLine(i, { preprocessing: e.target.value })} />
                        </td>
                        <td className="py-2"><Input type="number" min={1} className="h-8"
                          value={l.quantity} onChange={(e) => updateLine(i, { quantity: parseInt(e.target.value) || 1 })} /></td>
                        <td className="py-2 text-right">{formatMoney(l.unitPrice)}</td>
                        <td className="py-2 text-right font-medium">{formatMoney(l.unitPrice * l.quantity)}</td>
                        <td className="py-2"><button onClick={() => removeLine(i)} className="text-red-600 text-xs hover:underline">删除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

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
            <CardContent className="space-y-4">
              <div><Label>期望交期</Label><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></div>
              <div><Label>备注</Label><Textarea value={remark} onChange={(e) => setRemark(e.target.value)} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>金额汇总</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span>行数</span><span>{lines.length}</span></div>
              <div className="flex justify-between text-sm"><span>合计数量</span><span>{lines.reduce((s, l) => s + l.quantity, 0)}</span></div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>总金额</span><span className="text-emerald-700">{formatMoney(total)}</span></div>
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
