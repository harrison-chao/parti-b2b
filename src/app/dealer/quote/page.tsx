"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { STANDARD_SPECS_MR2525 } from "@/lib/pricing";
import { formatMoney } from "@/lib/utils";

type Result = {
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
};

export default function QuotePage() {
  const [mode, setMode] = useState<"standard" | "custom">("standard");
  const [lengthMm, setLengthMm] = useState<number>(254);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function calc(mm: number) {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">报价计算器</h1>
        <p className="text-muted-foreground text-sm">MR2525 商用线槽系列 — 实时计算各级报价</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>参数输入</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button variant={mode === "standard" ? "default" : "outline"} onClick={() => setMode("standard")} size="sm">标准规格</Button>
              <Button variant={mode === "custom" ? "default" : "outline"} onClick={() => setMode("custom")} size="sm">非标定制</Button>
            </div>

            {mode === "standard" ? (
              <div className="space-y-2">
                <Label>标准规格</Label>
                <div className="grid grid-cols-3 gap-2">
                  {STANDARD_SPECS_MR2525.map((s) => (
                    <Button
                      key={s.inch}
                      variant={lengthMm === s.mm ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setLengthMm(s.mm); calc(s.mm); }}
                    >
                      {s.inch}" ({s.mm}mm)
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>长度 (mm)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={lengthMm}
                    onChange={(e) => setLengthMm(parseFloat(e.target.value) || 0)}
                    min={1}
                    max={10000}
                  />
                  <Button onClick={() => calc(lengthMm)} disabled={loading}>
                    {loading ? "计算中" : "计算"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">输入任意长度（1-10000mm）</p>
              </div>
            )}

            {result && (
              <div className="pt-4 border-t space-y-2 text-sm">
                <div className="font-semibold mb-2">成本分解</div>
                <Row k="理论重量" v={`${result.theoreticalWeight} kg`} />
                <Row k="损耗重量" v={`${result.wasteWeight} kg`} />
                <Row k="实际重量" v={`${result.actualWeight} kg`} />
                <Row k="素材成本" v={formatMoney(result.materialCost)} />
                <Row k="表面处理" v={formatMoney(result.surfaceCost)} />
                <Row k="加工费" v={formatMoney(result.processingCost)} />
                <Row k="连接件" v={formatMoney(result.connectorCost)} />
                <Row k="总成本" v={formatMoney(result.totalCost)} bold />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>报价结果</CardTitle></CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-3">
                <Price label="零售价（不含税）" value={result.retailPrice} />
                <Price label="零售价（含税 10%）" value={result.retailPriceTax} tone="muted" />
                <div className="border-t pt-3">
                  <Price label="一级代理价 (50%)" value={result.level1Price} tone="blue" />
                  <Price label="二级代理价 (60%)" value={result.level2Price} tone="blue" />
                </div>
                <div className="border-t pt-3 bg-emerald-50 -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
                  <Price
                    label={`您的采购价（等级 ${result.priceLevel}）`}
                    value={result.dealerPrice}
                    tone="green"
                    big
                  />
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">等待输入参数...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base pt-1 border-t" : "text-muted-foreground"}`}>
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function Price({ label, value, tone, big }: { label: string; value: number; tone?: "muted" | "blue" | "green"; big?: boolean }) {
  const color = tone === "green" ? "text-emerald-700" : tone === "blue" ? "text-blue-700" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-sm ${color}`}>{label}</span>
      <span className={`font-semibold ${color} ${big ? "text-2xl" : "text-lg"}`}>{formatMoney(value)}</span>
    </div>
  );
}
