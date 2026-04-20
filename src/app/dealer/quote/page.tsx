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
import { genCustomSku, genCustomProductName } from "@/lib/options";
import { addToCart, getCart, cartTotal, type CartItem } from "@/lib/cart";

type Result = {
  lengthMm: number;
  actualWeight: number;
  priceLevel: string;
  discountPercent: number;
  dealerPrice: number;
  retailPrice: number;
};

type Opt = { code: string; label: string };

export default function QuotePage() {
  const router = useRouter();
  const [lengthMm, setLengthMm] = useState<number>(600);
  const [surfaceProcesses, setSurfaceProcesses] = useState<Opt[]>([]);
  const [surfaceColors, setSurfaceColors] = useState<Opt[]>([]);
  const [processingOps, setProcessingOps] = useState<Opt[]>([]);
  const [processingMods, setProcessingMods] = useState<Opt[]>([]);
  const [surfaceProc, setSurfaceProc] = useState<string>("");
  const [surfaceColor, setSurfaceColor] = useState<string>("");
  const [procOp, setProcOp] = useState<string>("");
  const [procMod, setProcMod] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(10);
  const [targetDiscount, setTargetDiscount] = useState<number>(100); // % of retail (default full retail)
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

  useEffect(() => {
    calc(lengthMm);
    fetch("/api/settings").then((r) => r.json()).then((j) => {
      if (j.code === 0) {
        setSurfaceProcesses(j.data.surfaceProcesses ?? []);
        setSurfaceColors(j.data.surfaceColors ?? []);
        setProcessingOps(j.data.processingOperations ?? []);
        setProcessingMods(j.data.processingModifiers ?? []);
        if (j.data.surfaceProcesses?.[0]) setSurfaceProc(j.data.surfaceProcesses[0].code);
        if (j.data.surfaceColors?.[0]) setSurfaceColor(j.data.surfaceColors[0].code);
        if (j.data.processingOperations?.[0]) setProcOp(j.data.processingOperations[0].code);
      }
    });
    /* eslint-disable-next-line */
  }, []);

  const surfaceCode = surfaceProc && surfaceColor ? `${surfaceProc}-${surfaceColor}` : "";
  const surfaceText = (() => {
    const p = surfaceProcesses.find((x) => x.code === surfaceProc)?.label;
    const c = surfaceColors.find((x) => x.code === surfaceColor)?.label;
    return p && c ? `${p} · ${c}` : surfaceCode;
  })();
  const processingCode = procOp ? (procMod ? `${procOp}-${procMod}` : procOp) : "";
  const processingText = (() => {
    const o = processingOps.find((x) => x.code === procOp)?.label;
    const m = processingMods.find((x) => x.code === procMod)?.label;
    return o ? (m ? `${o} · ${m}` : o) : "-";
  })();

  const targetPrice = result ? Math.round(result.retailPrice * (targetDiscount / 100) * 100) / 100 : 0;
  const unitProfit = result ? targetPrice - result.dealerPrice : 0;
  const totalProfit = unitProfit * quantity;

  function handleAddToCart() {
    if (!result) return;
    const item: CartItem = {
      id: `ci-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sku: genCustomSku("MR2525", result.lengthMm, surfaceCode, processingCode),
      productName: genCustomProductName("MR2525", result.lengthMm, surfaceText),
      series: "MR2525",
      lengthMm: result.lengthMm,
      surfaceTreatment: surfaceCode,
      surfaceLabel: surfaceText,
      preprocessing: processingCode,
      processingLabel: processingText,
      remark,
      quantity,
      unitPrice: result.dealerPrice,
      retailPrice: result.retailPrice,
      targetPrice,
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
              <Label>表面处理（工艺 · 颜色）</Label>
              <div className="grid grid-cols-2 gap-2">
                <select className="border rounded h-10 px-2 text-sm"
                  value={surfaceProc} onChange={(e) => setSurfaceProc(e.target.value)}>
                  {surfaceProcesses.map((s) => (
                    <option key={s.code} value={s.code}>{s.code} · {s.label}</option>
                  ))}
                </select>
                <select className="border rounded h-10 px-2 text-sm"
                  value={surfaceColor} onChange={(e) => setSurfaceColor(e.target.value)}>
                  {surfaceColors.map((s) => (
                    <option key={s.code} value={s.code}>{s.code} · {s.label}</option>
                  ))}
                </select>
              </div>
              {surfaceCode && <p className="text-xs text-muted-foreground">编码：<span className="font-mono">{surfaceCode}</span></p>}
            </div>

            <div className="space-y-2">
              <Label>加工工艺（操作 · 修饰）</Label>
              <div className="grid grid-cols-2 gap-2">
                <select className="border rounded h-10 px-2 text-sm"
                  value={procOp} onChange={(e) => setProcOp(e.target.value)}>
                  <option value="">（不加工）</option>
                  {processingOps.map((s) => (
                    <option key={s.code} value={s.code}>{s.code} · {s.label}</option>
                  ))}
                </select>
                <select className="border rounded h-10 px-2 text-sm"
                  value={procMod} onChange={(e) => setProcMod(e.target.value)}>
                  <option value="">（无修饰）</option>
                  {processingMods.map((s) => (
                    <option key={s.code} value={s.code}>{s.code} · {s.label}</option>
                  ))}
                </select>
              </div>
              {processingCode && <p className="text-xs text-muted-foreground">编码：<span className="font-mono">{processingCode}</span></p>}
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
              <Label>销售目标价 · 对外折扣 (% 零售价)</Label>
              <div className="flex items-center gap-3">
                <Input type="number" step="1" min={1} max={200}
                  value={targetDiscount}
                  onChange={(e) => setTargetDiscount(parseFloat(e.target.value) || 0)} />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  = {result ? formatMoney(targetPrice) : "-"}/根
                </span>
              </div>
              <p className="text-xs text-muted-foreground">按零售价的百分比设定对外销售价，用于计算本单利润</p>
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
                  <div className="flex justify-between"><span className="text-muted-foreground">表面处理</span><span>{surfaceText}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">加工工艺</span><span>{processingText}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">数量</span><span>{quantity} 根</span></div>
                </div>

                <div className="bg-emerald-50 rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-emerald-700">您的采购单价（等级 {result.priceLevel}，折扣 {result.discountPercent}%）</span>
                  </div>
                  <div className="text-3xl font-bold text-emerald-700">{formatMoney(result.dealerPrice)}<span className="text-sm font-normal text-emerald-600"> / 根</span></div>
                  <div className="pt-2 border-t border-emerald-200 flex justify-between items-center">
                    <span className="text-sm text-emerald-700">采购小计</span>
                    <span className="text-xl font-bold text-emerald-700">{formatMoney(result.dealerPrice * quantity)}</span>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">零售价</span>
                    <span>{formatMoney(result.retailPrice)} / 根</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">目标销售价（{targetDiscount}% 零售价）</span>
                    <span className="font-semibold">{formatMoney(targetPrice)} / 根</span>
                  </div>
                  <div className="border-t border-blue-200 pt-2 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-800">单根毛利</span>
                      <span className={unitProfit >= 0 ? "text-blue-800 font-semibold" : "text-red-600 font-semibold"}>
                        {formatMoney(unitProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-800">本单预计总毛利</span>
                      <span className={`text-lg font-bold ${totalProfit >= 0 ? "text-blue-800" : "text-red-600"}`}>
                        {formatMoney(totalProfit)}
                      </span>
                    </div>
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
