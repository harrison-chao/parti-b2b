"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

type Full = {
  lengthMm: number;
  theoreticalWeight: number;
  wasteWeight: number;
  actualWeight: number;
  materialCost: number;
  processingCost: number;
  surfaceCost: number;
  connectorCost: number;
  totalCost: number;
  retailPrice: number;
  retailPriceTax: number;
  level1Price: number;
  level2Price: number;
  dealerPrice: number;
  priceLevel: string;
  discountPercent: number;
};

const LEVELS = ["A", "B", "C"] as const;

export default function OpsPricingPage() {
  const [lengthMm, setLengthMm] = useState(600);
  const [level, setLevel] = useState<"A" | "B" | "C">("C");
  const [data, setData] = useState<Full | null>(null);
  const [loading, setLoading] = useState(false);

  async function calc(mm: number, lv: string) {
    if (!mm || mm <= 0) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/pricing/calculate?lengthMm=${mm}&level=${lv}`);
      const j = await r.json();
      if (j.code === 0) setData(j.data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { calc(lengthMm, level); /* eslint-disable-next-line */ }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">报价成本分析</h1>
        <p className="text-muted-foreground text-sm">管理员专用 · 完整成本构成与多级定价预览</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>参数</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>长度 (mm)</Label>
              <div className="flex gap-2">
                <Input type="number" value={lengthMm} onChange={(e) => setLengthMm(parseFloat(e.target.value) || 0)} />
                <Button onClick={() => calc(lengthMm, level)} disabled={loading}>{loading ? "..." : "计算"}</Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>经销商等级</Label>
              <div className="grid grid-cols-5 gap-1">
                {LEVELS.map((lv) => (
                  <Button key={lv} variant={level === lv ? "default" : "outline"} size="sm" onClick={() => { setLevel(lv); calc(lengthMm, lv); }}>{lv}</Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {data && (
          <>
            <Card>
              <CardHeader><CardTitle>成本分解</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row k="理论重量" v={`${data.theoreticalWeight} kg`} />
                <Row k="损耗重量" v={`${data.wasteWeight} kg`} />
                <Row k="实际重量" v={`${data.actualWeight} kg`} />
                <div className="border-t my-2"></div>
                <Row k="素材成本（28元/kg）" v={formatMoney(data.materialCost)} />
                <Row k="表面处理（5元/kg）" v={formatMoney(data.surfaceCost)} />
                <Row k="加工费（3元/支）" v={formatMoney(data.processingCost)} />
                <Row k="连接件（10元/支）" v={formatMoney(data.connectorCost)} />
                <div className="border-t my-2"></div>
                <Row k="总成本" v={formatMoney(data.totalCost)} bold />
                <Row k="毛利率" v="65%" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>各级定价</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Price label="零售价（不含税）" value={data.retailPrice} />
                <Price label="零售价（含税 10%）" value={data.retailPriceTax} tone="muted" />
                <div className="border-t my-2"></div>
                <Price label="一级代理（50%）" value={data.level1Price} tone="blue" />
                <Price label="二级代理（60%）" value={data.level2Price} tone="blue" />
                <div className="border-t my-2"></div>
                <Price label={`等级 ${data.priceLevel}（${data.discountPercent}%）`} value={data.dealerPrice} tone="green" big />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between ${bold ? "font-semibold" : "text-muted-foreground"}`}><span>{k}</span><span className={bold ? "text-foreground" : ""}>{v}</span></div>;
}
function Price({ label, value, tone, big }: { label: string; value: number; tone?: "muted" | "blue" | "green"; big?: boolean }) {
  const c = tone === "green" ? "text-emerald-700" : tone === "blue" ? "text-blue-700" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className={c}>{label}</span>
      <span className={`font-semibold ${c} ${big ? "text-xl" : ""}`}>{formatMoney(value)}</span>
    </div>
  );
}
