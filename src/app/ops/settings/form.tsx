"use client";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AllSettings, SurfaceOption, ProcessingOption } from "@/lib/settings";

type Option = { code: string; label: string };

export function SettingsForm({ initial }: { initial: AllSettings }) {
  const [surface, setSurface] = useState<Option[]>(initial.surfaceOptions);
  const [processing, setProcessing] = useState<Option[]>(initial.processingOptions);
  const [discount, setDiscount] = useState(initial.discountRates);
  const [pricing, setPricing] = useState(initial.pricingConfig);
  const [status, setStatus] = useState<Record<string, string>>({});

  async function save(key: string, value: any) {
    setStatus((s) => ({ ...s, [key]: "保存中..." }));
    const r = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    const j = await r.json();
    setStatus((s) => ({ ...s, [key]: j.code === 0 ? "✓ 已保存" : "✗ " + j.message }));
    setTimeout(() => setStatus((s) => ({ ...s, [key]: "" })), 3000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-muted-foreground text-sm">管理员专用 · 配置经销商端可选项与定价规则</p>
      </div>

      <OptionsCard
        title="表面处理选项"
        description="经销商下单时可选的表面处理工艺"
        items={surface}
        setItems={setSurface}
        onSave={() => save("surfaceOptions", surface)}
        status={status.surfaceOptions}
      />

      <OptionsCard
        title="加工工艺选项"
        description="经销商下单时可选的加工方式"
        items={processing}
        setItems={setProcessing}
        onSave={() => save("processingOptions", processing)}
        status={status.processingOptions}
      />

      <Card>
        <CardHeader>
          <CardTitle>经销商等级折扣</CardTitle>
          <CardDescription>各等级经销商相对零售价的折扣率（1.0 = 零售价）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["A", "B", "C", "D", "E"] as const).map((lv) => (
            <div key={lv} className="flex items-center gap-3">
              <span className="w-8 font-semibold">{lv}</span>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={discount[lv]}
                onChange={(e) => setDiscount({ ...discount, [lv]: parseFloat(e.target.value) || 0 })}
              />
              <span className="text-sm text-muted-foreground w-20">{Math.round(discount[lv] * 100)}%</span>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => save("discountRates", discount)}>保存等级折扣</Button>
            {status.discountRates && <span className="text-sm text-emerald-700">{status.discountRates}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>成本与定价参数</CardTitle>
          <CardDescription>影响报价公式的核心参数（仅管理员调整）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <PricingField label="型材米重 (kg/m)" k="meterWeight" value={pricing.meterWeight} onChange={(v) => setPricing({ ...pricing, meterWeight: v })} />
          <PricingField label="截断利用率" k="utilization" value={pricing.utilization} onChange={(v) => setPricing({ ...pricing, utilization: v })} />
          <PricingField label="素材价格 (元/kg)" k="materialPrice" value={pricing.materialPrice} onChange={(v) => setPricing({ ...pricing, materialPrice: v })} />
          <PricingField label="加工费 (元/支)" k="processingFee" value={pricing.processingFee} onChange={(v) => setPricing({ ...pricing, processingFee: v })} />
          <PricingField label="表面处理费 (元/kg)" k="surfacePricePerKg" value={pricing.surfacePricePerKg} onChange={(v) => setPricing({ ...pricing, surfacePricePerKg: v })} />
          <PricingField label="连接件费 (元/支)" k="connectorFee" value={pricing.connectorFee} onChange={(v) => setPricing({ ...pricing, connectorFee: v })} />
          <PricingField label="毛利率" k="grossMarginRate" value={pricing.grossMarginRate} onChange={(v) => setPricing({ ...pricing, grossMarginRate: v })} />
          <PricingField label="一级代理折扣" k="level1Rate" value={pricing.level1Rate} onChange={(v) => setPricing({ ...pricing, level1Rate: v })} />
          <PricingField label="二级代理折扣" k="level2Rate" value={pricing.level2Rate} onChange={(v) => setPricing({ ...pricing, level2Rate: v })} />
          <PricingField label="含税加成" k="taxRate" value={pricing.taxRate} onChange={(v) => setPricing({ ...pricing, taxRate: v })} />
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => save("pricingConfig", pricing)}>保存定价参数</Button>
            {status.pricingConfig && <span className="text-sm text-emerald-700">{status.pricingConfig}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OptionsCard({
  title, description, items, setItems, onSave, status,
}: {
  title: string; description: string;
  items: Option[]; setItems: (o: Option[]) => void;
  onSave: () => void; status?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input className="w-40 font-mono" placeholder="代码" value={it.code}
              onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, code: e.target.value } : x)))} />
            <Input placeholder="显示名称" value={it.label}
              onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} />
            <Button variant="outline" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}>删除</Button>
          </div>
        ))}
        <div className="flex items-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => setItems([...items, { code: "", label: "" }])}>+ 添加选项</Button>
          <Button onClick={onSave}>保存</Button>
          {status && <span className="text-sm text-emerald-700">{status}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function PricingField({ label, k, value, onChange }: { label: string; k: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-[260px_1fr] items-center gap-3">
      <Label>{label}</Label>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}
