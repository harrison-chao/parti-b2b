"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/utils";
import { getCart, removeFromCart, updateCartItem, clearCart, type CartItem } from "@/lib/cart";

type Address = { id: string; receiverName: string; receiverPhone: string; fullAddress: string; isDefault: boolean };

export function CheckoutForm({
  dealer,
  addresses,
}: {
  dealer: { id: string; companyName: string; priceLevel: string; paymentMethod: string; creditBalance: number };
  addresses: Address[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
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

  function reload() {
    setItems(getCart());
  }
  useEffect(() => {
    reload();
    setLoaded(true);
    const h = () => reload();
    window.addEventListener("cart-change", h);
    return () => window.removeEventListener("cart-change", h);
  }, []);

  function updateQty(id: string, qty: number) {
    updateCartItem(id, { quantity: Math.max(1, qty) });
    reload();
  }
  function remove(id: string) {
    removeFromCart(id);
    reload();
  }

  const total = useMemo(() => items.reduce((s, i) => s + i.unitPrice * i.quantity, 0), [items]);
  const targetTotal = useMemo(() => items.reduce((s, i) => s + (i.targetPrice ?? i.unitPrice) * i.quantity, 0), [items]);
  const profitTotal = targetTotal - total;
  const creditInsufficient = dealer.paymentMethod === "CREDIT" && total > dealer.creditBalance;

  async function submit(submitAfter: boolean) {
    setError("");
    if (items.length === 0) return setError("草稿为空，请先在报价计算器添加产品");
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
          lines: items.map((i) => ({
            sku: i.sku,
            productName: i.productName,
            lengthMm: i.lengthMm,
            surfaceTreatment: i.surfaceTreatment,
            preprocessing: `${i.preprocessing}${i.remark ? " / " + i.remark : ""}`,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            targetPrice: i.targetPrice ?? null,
            isCustom: true,
          })),
        }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      const orderNo = j.data.orderNo;
      if (submitAfter) {
        await fetch(`/api/orders/${orderNo}/submit`, { method: "POST" });
      }
      clearCart();
      router.push(`/dealer/orders/${orderNo}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!loaded) return null;

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center space-y-4">
          <p className="text-muted-foreground">订单草稿为空</p>
          <Link href="/dealer/quote"><Button>前往报价计算器添加产品</Button></Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">订单草稿 · 结算</h1>
        <Link href="/dealer/quote"><Button variant="outline" size="sm">继续添加产品</Button></Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>订单明细（{items.length} 项）</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b"><tr className="text-left">
                  <th className="p-3">产品</th>
                  <th className="p-3">规格</th>
                  <th className="p-3 w-20">数量</th>
                  <th className="p-3 text-right">采购单价</th>
                  <th className="p-3 text-right">目标售价</th>
                  <th className="p-3 text-right">单根毛利</th>
                  <th className="p-3 text-right">采购小计</th>
                  <th className="p-3"></th>
                </tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-b">
                      <td className="p-3">
                        <div className="font-medium">{i.productName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{i.sku}</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div>{i.lengthMm}mm · {i.surfaceLabel ?? i.surfaceTreatment}</div>
                        <div className="text-muted-foreground">{i.processingLabel ?? i.preprocessing}</div>
                        {i.remark && <div className="text-muted-foreground">备注: {i.remark}</div>}
                      </td>
                      <td className="p-3">
                        <Input type="number" min={1} className="h-8 w-16"
                          value={i.quantity} onChange={(e) => updateQty(i.id, parseInt(e.target.value) || 1)} />
                      </td>
                      <td className="p-3 text-right">{formatMoney(i.unitPrice)}</td>
                      <td className="p-3 text-right">{i.targetPrice != null ? formatMoney(i.targetPrice) : "-"}</td>
                      <td className="p-3 text-right">
                        {i.targetPrice != null ? (
                          <span className={i.targetPrice - i.unitPrice >= 0 ? "text-blue-700" : "text-red-600"}>
                            {formatMoney(i.targetPrice - i.unitPrice)}
                          </span>
                        ) : "-"}
                      </td>
                      <td className="p-3 text-right font-medium">{formatMoney(i.unitPrice * i.quantity)}</td>
                      <td className="p-3"><button onClick={() => remove(i.id)} className="text-red-600 text-xs hover:underline">删除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <div><Label>订单备注</Label><Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="整单级别的备注" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>金额汇总</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span>行数</span><span>{items.length}</span></div>
              <div className="flex justify-between text-sm"><span>合计数量</span><span>{items.reduce((s, i) => s + i.quantity, 0)} 根</span></div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t"><span>采购总金额</span><span className="text-emerald-700">{formatMoney(total)}</span></div>
              <div className="flex justify-between text-sm"><span>目标销售总金额</span><span>{formatMoney(targetTotal)}</span></div>
              <div className="flex justify-between text-base font-semibold">
                <span>本单预计总毛利</span>
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
