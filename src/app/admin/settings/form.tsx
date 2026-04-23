"use client";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AllSettings, Option, PricingField } from "@/lib/settings";
import { PRICE_TIERS, PRICE_TIER_LABEL } from "@/lib/pricing";

export function SettingsForm({ initial }: { initial: AllSettings }) {
  const [surfaceProcesses, setSurfaceProcesses] = useState<Option[]>(initial.surfaceProcesses);
  const [surfaceColors, setSurfaceColors] = useState<Option[]>(initial.surfaceColors);
  const [processingOperations, setProcessingOperations] = useState<Option[]>(initial.processingOperations);
  const [discount, setDiscount] = useState(initial.discountRates);
  const [pricing, setPricing] = useState<PricingField[]>(initial.pricingFields);
  const [carriers, setCarriers] = useState<string[]>(initial.carriers);
  const [stamp, setStamp] = useState(initial.stampTemplate);
  const [stampUploading, setStampUploading] = useState(false);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [backupStatus, setBackupStatus] = useState("");

  async function uploadStamp(file: File) {
    setStampUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/uploads/stamp", { method: "POST", body: fd });
      const j = await r.json();
      if (j.code !== 0) { alert("上传失败: " + j.message); return; }
      const next = {
        url: j.data.url,
        fileName: j.data.fileName,
        companyName: stamp?.companyName ?? "",
        updatedAt: new Date().toISOString(),
      };
      setStamp(next);
      await save("stampTemplate", next);
    } finally {
      setStampUploading(false);
    }
  }

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

  async function runBackup() {
    setBackupStatus("备份中...");
    const r = await fetch("/api/cron/daily-backup");
    const j = await r.json();
    if (j.code !== 0) {
      setBackupStatus("✗ " + j.message);
      return;
    }
    setBackupStatus(`✓ 已备份到 ${j.data.bucket}/${j.data.path}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-muted-foreground text-sm">
          管理员专用 · 表面处理码 = 工艺码-色码（如 A-SV），加工码 = 操作-修饰（如 L-600MM）
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>数据备份</CardTitle>
          <CardDescription>
            系统会在北京时间每天 02:10 自动备份运营数据到 Supabase private bucket：backups。备份不包含用户密码哈希。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={runBackup}>立即执行备份</Button>
          {backupStatus && <span className="text-sm text-muted-foreground">{backupStatus}</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>表面处理选项</CardTitle>
          <CardDescription>两个下拉框（工艺类型 · 颜色），下单时选择后编码自动组合 工艺码-色码</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6">
          <OptionList
            title="表面处理工艺"
            codePlaceholder="如 A、P、W、T"
            items={surfaceProcesses}
            setItems={setSurfaceProcesses}
            onSave={() => save("surfaceProcesses", surfaceProcesses)}
            status={status.surfaceProcesses}
          />
          <OptionList
            title="颜色选项"
            codePlaceholder="如 SV、RAL9003、WO"
            items={surfaceColors}
            setItems={setSurfaceColors}
            onSave={() => save("surfaceColors", surfaceColors)}
            status={status.surfaceColors}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>加工工艺选项</CardTitle>
          <CardDescription>工艺操作下拉框，下单时选用对应操作码</CardDescription>
        </CardHeader>
        <CardContent>
          <OptionList
            title="工艺操作"
            codePlaceholder="如 L、D、T、CH"
            items={processingOperations}
            setItems={setProcessingOperations}
            onSave={() => save("processingOperations", processingOperations)}
            status={status.processingOperations}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>经销商等级折扣</CardTitle>
          <CardDescription>各等级经销商相对零售价的折扣率（1.0 = 零售价）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PRICE_TIERS.map((lv) => (
            <div key={lv} className="flex items-center gap-3">
              <span className="w-32 font-semibold text-sm">{PRICE_TIER_LABEL[lv]}</span>
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
          <CardDescription>
            影响报价公式的核心参数。内置项（key 不可变）用于公式；可在末尾自定义添加参考项目。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pricing.map((f, idx) => (
            <div key={idx} className="grid grid-cols-[180px_1fr_160px_90px] items-center gap-2">
              <Input
                className="font-mono"
                placeholder="key"
                value={f.key}
                disabled={f.builtin}
                onChange={(e) => setPricing(pricing.map((x, i) => i === idx ? { ...x, key: e.target.value } : x))}
              />
              <Input
                placeholder="显示名称"
                value={f.label}
                onChange={(e) => setPricing(pricing.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))}
              />
              <Input
                type="number"
                step="0.01"
                value={f.value}
                onChange={(e) => setPricing(pricing.map((x, i) => i === idx ? { ...x, value: parseFloat(e.target.value) || 0 } : x))}
              />
              <Button variant="outline" size="sm" disabled={f.builtin}
                onClick={() => setPricing(pricing.filter((_, i) => i !== idx))}>
                {f.builtin ? "内置" : "删除"}
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" size="sm"
              onClick={() => setPricing([...pricing, { key: "", label: "", value: 0 }])}>
              + 添加自定义参数
            </Button>
            <Button onClick={() => save("pricingFields", pricing)}>保存定价参数</Button>
            {status.pricingFields && <span className="text-sm text-emerald-700">{status.pricingFields}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>物流承运商</CardTitle>
          <CardDescription>车间确认出运时的下拉选项。列表外仍可选择"其他"自行输入。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {carriers.map((c, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                placeholder="如 顺丰速运"
                value={c}
                onChange={(e) => setCarriers(carriers.map((x, i) => i === idx ? e.target.value : x))}
              />
              <Button variant="outline" size="sm" onClick={() => setCarriers(carriers.filter((_, i) => i !== idx))}>删除</Button>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => setCarriers([...carriers, ""])}>+ 添加</Button>
            <Button onClick={() => save("carriers", carriers.map((c) => c.trim()).filter(Boolean))}>保存承运商</Button>
            {status.carriers && <span className="text-sm text-emerald-700">{status.carriers}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>采购合同章模板</CardTitle>
          <CardDescription>上传公司合同章 PNG（建议透明底，320×320 像素以上），采购单导出 PDF 时自动加盖</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stamp?.url ? (
            <div className="flex items-center gap-4">
              <img src={stamp.url} alt="合同章" className="w-32 h-32 object-contain border rounded bg-white" />
              <div className="text-sm space-y-1">
                <div className="text-muted-foreground">{stamp.fileName}</div>
                {stamp.updatedAt && <div className="text-xs text-muted-foreground">更新于 {new Date(stamp.updatedAt).toLocaleString("zh-CN")}</div>}
                <Button variant="outline" size="sm" onClick={() => { setStamp(null); save("stampTemplate", null); }}>移除</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">尚未上传合同章</p>
          )}
          <div className="flex items-center gap-3">
            <Label className="cursor-pointer">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadStamp(f); e.target.value = ""; }}
              />
              <span className="inline-flex items-center h-9 px-4 rounded-md bg-slate-900 text-white text-sm">
                {stampUploading ? "上传中..." : (stamp?.url ? "替换合同章" : "上传合同章")}
              </span>
            </Label>
            <Input
              placeholder="公司名称（盖章底部标注）"
              value={stamp?.companyName ?? ""}
              onChange={(e) => setStamp(stamp ? { ...stamp, companyName: e.target.value } : null)}
              onBlur={() => stamp && save("stampTemplate", stamp)}
              className="max-w-xs"
              disabled={!stamp}
            />
            {status.stampTemplate && <span className="text-sm text-emerald-700">{status.stampTemplate}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OptionList({
  title, codePlaceholder, items, setItems, onSave, status,
}: {
  title: string; codePlaceholder: string;
  items: Option[]; setItems: (o: Option[]) => void;
  onSave: () => void; status?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{title}</Label>
      {items.map((it, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input className="w-28 font-mono" placeholder={codePlaceholder} value={it.code}
            onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, code: e.target.value.toUpperCase() } : x)))} />
          <Input placeholder="显示名称" value={it.label}
            onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)))} />
          <Button variant="outline" size="sm" onClick={() => setItems(items.filter((_, i) => i !== idx))}>删除</Button>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" size="sm" onClick={() => setItems([...items, { code: "", label: "" }])}>+ 添加</Button>
        <Button size="sm" onClick={onSave}>保存</Button>
        {status && <span className="text-sm text-emerald-700">{status}</span>}
      </div>
    </div>
  );
}
