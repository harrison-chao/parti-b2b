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
  packagingCost: number;
  totalCost: number;
  retailPrice: number;
  retailPriceTax: number;
  costSource: string;
  perMeterPrice: number | null;
};

type Op = { code: string; label: string; unitPrice?: number };
type RawProduct = { id: string; sku: string; productName: string; weightPerMeter?: string | number | null; yieldRate?: string | number | null };

// 渠道阶梯四档（SESSION-01 渠道阶梯重定）：零售 ×1.0 显示在零售价行，其余三档在此列示
const TIERS = [
  { label: "共创先锋", rate: 0.85 },
  { label: "区域代理", rate: 0.65 },
  { label: "战略合伙人", rate: 0.5 },
] as const;
const STD_INCH = [8, 10, 11, 13, 16, 20, 24, 28, 30];

export default function OpsPricingPage() {
  const [inch, setInch] = useState(8);
  const [lengthMm, setLengthMm] = useState(203.2);
  const [rawId, setRawId] = useState<string>("");
  const [ops, setOps] = useState<string[]>(["L", "D", "EM"]);
  const [data, setData] = useState<Full | null>(null);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<Record<string, number>>({});
  const [operations, setOperations] = useState<Op[]>([]);
  const [raws, setRaws] = useState<RawProduct[]>([]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.code === 0) {
          if (Array.isArray(j.data?.pricingFields)) {
            setParams(Object.fromEntries(j.data.pricingFields.map((f: { key: string; value: number }) => [f.key, f.value])));
          }
          if (Array.isArray(j.data?.processingOperations)) setOperations(j.data.processingOperations);
        }
      })
      .catch(() => {});
    fetch("/api/products?category=PROFILE&activeOnly=1")
      .then((r) => r.json())
      .then((j) => {
        if (j.code === 0 && Array.isArray(j.data)) {
          const list = (j.data as RawProduct[]).filter((p) => (p as any).isRawMaterial);
          setRaws(list);
          if (list[0]) setRawId((cur) => cur || list[0].id);
        }
      })
      .catch(() => {});
  }, []);
  const p = (k: string) => (params[k] != null ? params[k] : null);
  const opPrice = (code: string) => operations.find((o) => o.code === code)?.unitPrice ?? null;

  // 素材价：行情公式优先，无行情显示回退值
  const materialPerKg =
    p("ingotPrice") != null && (p("ingotPrice") ?? 0) > 0
      ? Math.round(((p("ingotPrice")! + (p("extrusionFee") ?? 0)) / 1000) * (1 + (p("inputTaxRate") ?? 0)) * 10000) / 10000
      : p("materialPrice");

  async function calc(mm: number, rid: string, opCodes: string[]) {
    if (!mm || mm <= 0) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ lengthMm: String(mm), processCodes: opCodes.join(",") });
      if (rid) qs.set("rawProductId", rid);
      const r = await fetch(`/api/pricing/calculate?${qs.toString()}`);
      const j = await r.json();
      if (j.code === 0) setData(j.data);
    } finally {
      setLoading(false);
    }
  }

  // 任一输入变化即重算
  useEffect(() => { void calc(lengthMm, rawId, ops); /* eslint-disable-next-line */ }, [lengthMm, rawId, ops]);

  const setLenFromInch = (v: number) => {
    setInch(v);
    setLengthMm(+(v * 25.4).toFixed(1));
  };
  const setLenFromMm = (v: number) => {
    setLengthMm(v);
    setInch(+(v / 25.4).toFixed(2));
  };
  // EM(预埋连接件)隐含截断+铣销子孔:勾 EM 自动带上 L/D;勾着 EM 时取消 L/D 视为也不要 EM
  const toggleOp = (code: string) => {
    setOps((cur) => {
      if (cur.includes(code)) {
        const next = cur.filter((c) => c !== code);
        return code === "L" || code === "D" ? next.filter((c) => c !== "EM") : next;
      }
      const next = code === "EM" ? Array.from(new Set([...cur, "L", "D"])) : [...cur, code];
      return next;
    });
  };

  const opsDetail = ops
    .map((c) => `${operations.find((o) => o.code === c)?.label ?? c}${opPrice(c) != null ? ` ${opPrice(c)}` : ""}`)
    .join(" + ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">报价成本分析</h1>
        <p className="text-muted-foreground text-sm">
          管理员专用 · 与对外报价计算器同口径（素材=铝锭公式价，工序计价，EM 已含截断+铣孔，勾 EM 才收连接件）
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>参数</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>切长（英寸 ⇄ mm 自动换算）</Label>
              <div className="flex gap-2">
                <Input type="number" step="0.01" value={inch} onChange={(e) => setLenFromInch(parseFloat(e.target.value) || 0)} />
                <Input type="number" step="0.1" value={lengthMm} onChange={(e) => setLenFromMm(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {STD_INCH.map((n) => (
                  <Button key={n} variant={inch === n ? "default" : "outline"} size="sm" className="h-7 px-2 text-xs"
                    onClick={() => setLenFromInch(n)}>{n}寸</Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>原料 SKU（米重/良率/每米价基准）</Label>
              <select className="border rounded px-2 py-2 text-sm w-full bg-background"
                value={rawId} onChange={(e) => setRawId(e.target.value)}>
                <option value="">不指定（全局常数）</option>
                {raws.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.sku}{r.weightPerMeter ? `（${Number(r.weightPerMeter)}kg/m）` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>加工工序（EM 已含截断+铣销子孔）</Label>
              <div className="flex flex-wrap gap-1">
                {operations.map((o) => (
                  <Button key={o.code} variant={ops.includes(o.code) ? "default" : "outline"} size="sm" className="h-7 px-2 text-xs"
                    onClick={() => toggleOp(o.code)}>
                    {o.label}{o.unitPrice != null ? ` ${o.unitPrice}元` : ""}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {data && (
          <>
            <Card>
              <CardHeader><CardTitle>成本分解{loading ? "…" : ""}</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row k="计价口径" v={data.costSource === "AVG" ? "AVG 车间均价" : data.costSource === "PURCHASE" ? "PURCHASE 采购价折算" : "SETTINGS 全局常数"} />
                {data.perMeterPrice != null && <Row k="每米价" v={`${data.perMeterPrice} 元/m`} />}
                <Row k="理论重量" v={`${data.theoreticalWeight} kg`} />
                <Row k="损耗重量" v={`${data.wasteWeight} kg`} />
                <Row k="实际重量" v={`${data.actualWeight} kg`} />
                <div className="border-t my-2"></div>
                <Row k={`素材成本（${materialPerKg != null ? materialPerKg + "元/kg" : "行情公式"}）`} v={formatMoney(data.materialCost)} />
                <Row k={`表面处理${p("surfacePricePerKg") != null ? `（${p("surfacePricePerKg")}元/kg）` : ""}`} v={formatMoney(data.surfaceCost)} />
                <Row k={`加工费（${opsDetail || "未勾工序"};EM 已含截断+铣孔）`} v={formatMoney(data.processingCost)} />
                <Row k={`连接件${ops.includes("EM") ? "" : "（未勾 EM 免收）"}`} v={formatMoney(data.connectorCost)} />
                <Row k={`包材包装${p("packagingFee") != null ? `（${p("packagingFee")}元/支）` : ""}`} v={formatMoney(data.packagingCost)} />
                <div className="border-t my-2"></div>
                <Row k="总成本" v={formatMoney(data.totalCost)} bold />
                <Row k="毛利率" v={p("grossMarginRate") != null ? `${Math.round(p("grossMarginRate")! * 100)}%（报价加成口径）` : "-"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>各级定价</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Price label="零售价（不含税 ×100%）" value={data.retailPrice} />
                <Price label={`零售价（含税 ${p("taxRate") != null ? Math.round((p("taxRate")! - 1) * 100) : 10}%）`} value={data.retailPriceTax} tone="muted" />
                <div className="border-t my-2"></div>
                {TIERS.map((t) => (
                  <Price key={t.label} label={`${t.label}（零售 ×${Math.round(t.rate * 100)}%）`} value={data.retailPrice * t.rate} tone="green" />
                ))}
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
  const c = tone === "green" ? "text-emerald-300" : tone === "blue" ? "text-sky-300" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className={c}>{label}</span>
      <span className={`font-semibold ${c} ${big ? "text-xl" : ""}`}>{formatMoney(value)}</span>
    </div>
  );
}
