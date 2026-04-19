"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/utils";
import { SURFACE_OPTIONS, PROCESSING_OPTIONS, surfaceLabel, processingLabel, genCustomSku, genCustomProductName } from "@/lib/options";
import { addToCart, getCart, cartTotal, type CartItem } from "@/lib/cart";

type Result = {
  lengthMm: number;
  actualWeight: number;
  priceLevel: string;
  discountPercent: number;
  dealerPrice: number;
};

export default function QuotePage() {
  const router = useRouter();
  const [lengthMm, setLengthMm] = useState<number>(600);
  const [surface, setSurface] = useState<string>(SURFACE_OPTIONS[0].code);
  const [processing, setProcessing] = useState<string>(PROCESSING_OPTIONS[0].code);
  const [quantity, setQuantity] = useState<number>(10);
  const [remark, setRemark] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartAmount, setCartAmount] = useState(0);
  const [flash, setFlash] = useState("");

  function refreshCart() {
    const items = getCart();
    setCartCount(items.reduce((s, i) => s + i.quantity, 0));
    setCartAmount(cartTotal(items));
  }

  useEffect(() => {
    refreshCart();
    const h = () => refreshCart();
    window.addEventListener("cart-change", h);
    return () => window.removeEventListener("cart-change", h);
  }, []);

  async function calc(mm: number) {
    if (!mm || mm <= 0) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/pricing/calculate?lengthMm=${mm}`);
      const j = await r.json();
      if (j.code === 0) setResult(j.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { calc(lengthMm); /* eslint-disable-next-line */ }, []);

  function handleAddToCart() {
    if (!result) return;
    const item: CartItem = {
      id: `ci-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sku: genCustomSku("MR2525", result.lengthMm, surface, processing),
      productName: genCustomProductName("MR2525", result.lengthMm, surface),
      series: "MR2525",
      lengthMm: result.lengthMm,
      surfaceTreatment: surface,
      preprocessing: processing,
      remark,
      quantity,
      unitPrice: result.dealerPrice,
    };
    addToCart(item);
    setFlash(`已加入草稿（${quantity} 根 × ${formatMoney(result.dealerPrice)}）`);
    setTimeout(() => setFlash(""), 2500);
    setRemark("");
    refreshCart();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">报价计算器</h1>
          <p className="text-muted-foreground text-sm">MR2525 商用线槽 · 定制长度下单</p>
        </div>
        {cartCount > 0 && (
          <Button onClick={() => router.push("/dealer/orders/new")} className="bg-emerald-600 hover:bg-emerald-700">
            🛒 订单草稿 ({cartCount} 根 · {formatMoney(cartAmount)})
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>产品定制</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>长度 (mm)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={lengthMm}
                  onChange={(e) => setLengthMm(parseFloat(e.target.value) || 0)}
                  min={1}
                  max={10000}
                  onBlur={() => calc(lengthMm)}
                />
                <Button onClick={() => calc(lengthMm)} disabled={loading}>
                  {loading ? "..." : "计算"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">可输入任意长度（1-10000mm）</p>
            </div>

            <div className="space-y-2">
              <Label>表面处理</Label>
              <div className="grid grid-cols-2 gap-2">
                {SURFACE_OPTIONS.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => setSurface(s.code)}
                    className={`text-left border rounded px-3 py-2 text-sm transition ${surface === s.code ? "border-slate-900 bg-slate-900 text-white" : "hover:bg-slate-50"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>加工工艺</Label>
              <div className="grid grid-cols-2 gap-2">
                {PROCESSING_OPTIONS.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => setProcessing(p.code)}
                    className={`text-left border rounded px-3 py-2 text-sm transition ${processing === p.code ? "border-slate-900 bg-slate-900 text-white" : "hover:bg-slate-50"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>数量（根）</Label>
                <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value) || 1)} />
              </div>
              <div className="space-y-2">
                <Label>价格等级</Label>
                <div className="h-10 flex items-center">
                  {result && <Badge className="bg-emerald-100 text-emerald-700 text-sm px-3 py-1">{result.priceLevel} 级 · 折扣 {result.discountPercent}%</Badge>}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="可填特殊加工要求、包装要求等" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>报价结果</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {result ? (
              <>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">长度</span><span>{result.lengthMm} mm</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">表面处理</span><span>{surfaceLabel(surface)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">加工工艺</span><span>{processingLabel(processing)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">数量</span><span>{quantity} 根</span></div>
                </div>

                <div className="bg-emerald-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-emerald-700">您的单价（等级 {result.priceLevel}，折扣 {result.discountPercent}%）</span>
                  </div>
                  <div className="text-3xl font-bold text-emerald-700">{formatMoney(result.dealerPrice)}<span className="text-sm font-normal text-emerald-600"> / 根</span></div>
                  <div className="pt-2 border-t border-emerald-200 flex justify-between items-center">
                    <span className="text-sm text-emerald-700">小计</span>
                    <span className="text-xl font-bold text-emerald-700">{formatMoney(result.dealerPrice * quantity)}</span>
                  </div>
                </div>

                <Button className="w-full" size="lg" onClick={handleAddToCart}>
                  🛒 加入订单草稿
                </Button>
                {flash && <p className="text-sm text-emerald-700 text-center">{flash}</p>}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">等待输入参数...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
