"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

type Contact = {
  role: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  wechat?: string | null;
  isPrimary?: boolean;
  remark?: string | null;
};

type Supplier = {
  id: string;
  supplierNo: string;
  name: string;
  category: string;
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
  taxNo: string | null;
  invoiceType: string | null;
  bankName: string | null;
  bankAccount: string | null;
  paymentTerms: string | null;
  paymentDays: number;
  defaultLeadTimeDays: number;
  serviceScope: string | null;
  remark: string | null;
  isActive: boolean;
  contacts: Contact[];
};

const CATEGORY_LABEL: Record<string, string> = {
  RAW_MATERIAL: "原料",
  HARDWARE: "五金",
  OUTSOURCED: "外协",
  LOGISTICS: "物流",
  SERVICE: "服务",
  OTHER: "其他",
};

const emptyContact = (): Contact => ({ role: "业务联系人", name: "", phone: "", email: "", wechat: "", isPrimary: false, remark: "" });

export function SupplierManager({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(suppliers);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [active, setActive] = useState("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((s) => {
      const matchesQ = !q || [s.supplierNo, s.name, s.contactName, s.contactPhone, s.serviceScope, s.address]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
      const matchesCategory = category === "ALL" || s.category === category;
      const matchesActive = active === "ALL" || String(s.isActive) === active;
      return matchesQ && matchesCategory && matchesActive;
    });
  }, [active, category, query, rows]);

  async function toggleActive(s: Supplier) {
    await fetch(`/api/suppliers/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    setRows(rows.map((x) => x.id === s.id ? { ...x, isActive: !x.isActive } : x));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">供应商主数据</h1>
          <p className="text-sm text-muted-foreground">维护供应分类、联系人、付款资料、供货范围和默认交期</p>
        </div>
        <Button size="sm" onClick={() => { setCreating(true); setEditing(null); }}>+ 新增供应商</Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-5 md:grid-cols-4 md:pt-6">
          <Input placeholder="搜索编号 / 名称 / 联系人 / 范围" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="h-10 rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="ALL">全部分类</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="h-10 rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm" value={active} onChange={(e) => setActive(e.target.value)}>
            <option value="ALL">全部状态</option><option value="true">启用</option><option value="false">停用</option>
          </select>
          <div className="flex items-center text-sm text-muted-foreground">共 {filtered.length} / {rows.length} 家供应商</div>
        </CardContent>
      </Card>

      {(creating || editing) && (
        <SupplierForm
          supplier={editing}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSaved={(saved, isNew) => {
            if (isNew) setRows([{ ...saved, isActive: true }, ...rows]);
            else setRows(rows.map((s) => s.id === saved.id ? { ...s, ...saved } : s));
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="border-b bg-white/40"><tr className="text-left">
              <th className="p-3">编号 / 名称</th><th className="p-3">分类</th><th className="p-3">主联系人</th>
              <th className="p-3">供货范围</th><th className="p-3">付款条件</th><th className="p-3">默认交期</th>
              <th className="p-3">银行/税务</th><th className="p-3">状态</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {filtered.map((s) => {
                const primary = s.contacts?.find((c) => c.isPrimary) ?? s.contacts?.[0];
                return (
                  <tr key={s.id} className="border-b">
                    <td className="p-3">
                      <div className="font-mono text-xs text-muted-foreground">{s.supplierNo}</div>
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.address || "-"}</div>
                    </td>
                    <td className="p-3"><Badge className="bg-slate-100 text-slate-700">{CATEGORY_LABEL[s.category] ?? s.category}</Badge></td>
                    <td className="p-3">
                      <div>{primary?.name ?? s.contactName ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{primary?.role ?? "业务联系人"} · {primary?.phone ?? s.contactPhone ?? "-"}</div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{s.serviceScope || "-"}</td>
                    <td className="p-3 text-xs">{s.paymentTerms || "-"}{s.paymentDays ? <div className="text-muted-foreground">{s.paymentDays} 天账期</div> : null}</td>
                    <td className="p-3 text-xs">{s.defaultLeadTimeDays ? `${s.defaultLeadTimeDays} 天` : "-"}</td>
                    <td className="p-3 text-xs">
                      <div>{s.bankName || "-"}</div>
                      <div className="text-muted-foreground">{s.taxNo ? `税号 ${s.taxNo}` : "-"}</div>
                    </td>
                    <td className="p-3">
                      <Badge className={s.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}>
                        {s.isActive ? "启用" : "停用"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setEditing(s); setCreating(false); }}>编辑</Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(s)}>{s.isActive ? "停用" : "启用"}</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">暂无供应商</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SupplierForm({ supplier, onCancel, onSaved }: {
  supplier: Supplier | null;
  onCancel: () => void;
  onSaved: (supplier: Supplier, isNew: boolean) => void;
}) {
  const [form, setForm] = useState({
    supplierNo: supplier?.supplierNo ?? "",
    name: supplier?.name ?? "",
    category: supplier?.category ?? "OTHER",
    contactName: supplier?.contactName ?? "",
    contactPhone: supplier?.contactPhone ?? "",
    address: supplier?.address ?? "",
    taxNo: supplier?.taxNo ?? "",
    invoiceType: supplier?.invoiceType ?? "增值税普通发票",
    bankName: supplier?.bankName ?? "",
    bankAccount: supplier?.bankAccount ?? "",
    paymentTerms: supplier?.paymentTerms ?? "",
    paymentDays: supplier?.paymentDays ?? 0,
    defaultLeadTimeDays: supplier?.defaultLeadTimeDays ?? 0,
    serviceScope: supplier?.serviceScope ?? "",
    remark: supplier?.remark ?? "",
    isActive: supplier?.isActive ?? true,
  });
  const [contacts, setContacts] = useState<Contact[]>(
    supplier?.contacts?.length ? supplier.contacts : [{ role: "业务联系人", name: supplier?.contactName ?? "", phone: supplier?.contactPhone ?? "", email: "", wechat: "", isPrimary: true, remark: "" }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const patch = (key: keyof typeof form, value: string | number | boolean) => setForm((f) => ({ ...f, [key]: value }));
  const patchContact = (idx: number, data: Partial<Contact>) => setContacts((rows) => rows.map((r, i) => i === idx ? { ...r, ...data } : r));

  async function save() {
    setError("");
    setSaving(true);
    try {
      const normalizedContacts = contacts.filter((c) => c.name.trim()).map((c, idx) => ({ ...c, isPrimary: c.isPrimary || idx === 0 }));
      const primary = normalizedContacts.find((c) => c.isPrimary) ?? normalizedContacts[0];
      const payload = {
        ...form,
        supplierNo: form.supplierNo.trim(),
        name: form.name.trim(),
        contactName: primary?.name ?? null,
        contactPhone: primary?.phone ?? null,
        taxNo: form.taxNo || null,
        invoiceType: form.invoiceType || null,
        bankName: form.bankName || null,
        bankAccount: form.bankAccount || null,
        paymentTerms: form.paymentTerms || null,
        paymentDays: Number(form.paymentDays),
        defaultLeadTimeDays: Number(form.defaultLeadTimeDays),
        serviceScope: form.serviceScope || null,
        address: form.address || null,
        remark: form.remark || null,
        contacts: normalizedContacts,
      };
      const url = supplier ? `/api/suppliers/${supplier.id}` : "/api/suppliers";
      const method = supplier ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (j.code !== 0) {
        setError(j.message);
        return;
      }
      onSaved({ ...supplier, ...payload, id: j.data.id, isActive: payload.isActive } as Supplier, !supplier);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{supplier ? "编辑供应商档案" : "新增供应商档案"}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <section>
          <h3 className="mb-3 text-sm font-bold text-slate-700">基础资料</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="供应商编号"><Input value={form.supplierNo} disabled={!!supplier} onChange={(e) => patch("supplierNo", e.target.value)} placeholder="SUP-003" /></Field>
            <Field label="供应商名称"><Input value={form.name} onChange={(e) => patch("name", e.target.value)} /></Field>
            <Field label="供应分类">
              <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm" value={form.category} onChange={(e) => patch("category", e.target.value)}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="状态">
              <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm" value={String(form.isActive)} onChange={(e) => patch("isActive", e.target.value === "true")}>
                <option value="true">启用</option><option value="false">停用</option>
              </select>
            </Field>
            <div className="md:col-span-2"><Field label="地址"><Input value={form.address} onChange={(e) => patch("address", e.target.value)} /></Field></div>
            <div className="md:col-span-2"><Field label="供货范围"><Input value={form.serviceScope} onChange={(e) => patch("serviceScope", e.target.value)} placeholder="如 6063 原料棒 / 五金配件 / 外协喷涂" /></Field></div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700">联系人</h3>
            <Button size="sm" variant="outline" onClick={() => setContacts([...contacts, emptyContact()])}>+ 添加联系人</Button>
          </div>
          <div className="space-y-2">
            {contacts.map((c, idx) => (
              <div key={idx} className="grid gap-2 rounded-2xl border bg-white/50 p-3 md:grid-cols-7">
                <Input placeholder="角色" value={c.role} onChange={(e) => patchContact(idx, { role: e.target.value })} />
                <Input placeholder="姓名" value={c.name} onChange={(e) => patchContact(idx, { name: e.target.value })} />
                <Input placeholder="电话" value={c.phone ?? ""} onChange={(e) => patchContact(idx, { phone: e.target.value })} />
                <Input placeholder="邮箱" value={c.email ?? ""} onChange={(e) => patchContact(idx, { email: e.target.value })} />
                <Input placeholder="微信" value={c.wechat ?? ""} onChange={(e) => patchContact(idx, { wechat: e.target.value })} />
                <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!!c.isPrimary} onChange={() => setContacts(contacts.map((x, i) => ({ ...x, isPrimary: i === idx })))} />主联系人</label>
                <Button size="sm" variant="ghost" onClick={() => setContacts(contacts.filter((_, i) => i !== idx))}>删除</Button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-bold text-slate-700">财务与履约</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="付款条件"><Input value={form.paymentTerms} onChange={(e) => patch("paymentTerms", e.target.value)} placeholder="月结 / 货到付款 / 预付" /></Field>
            <Field label="账期（天）"><Input type="number" min={0} value={form.paymentDays} onChange={(e) => patch("paymentDays", parseInt(e.target.value) || 0)} /></Field>
            <Field label="默认交期（天）"><Input type="number" min={0} value={form.defaultLeadTimeDays} onChange={(e) => patch("defaultLeadTimeDays", parseInt(e.target.value) || 0)} /></Field>
            <Field label="发票类型"><Input value={form.invoiceType} onChange={(e) => patch("invoiceType", e.target.value)} /></Field>
            <Field label="税号"><Input value={form.taxNo} onChange={(e) => patch("taxNo", e.target.value)} /></Field>
            <Field label="开户行"><Input value={form.bankName} onChange={(e) => patch("bankName", e.target.value)} /></Field>
            <Field label="银行账号"><Input value={form.bankAccount} onChange={(e) => patch("bankAccount", e.target.value)} /></Field>
          </div>
        </section>

        <Field label="备注"><Textarea value={form.remark} onChange={(e) => patch("remark", e.target.value)} /></Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>{saving ? "保存中..." : (supplier ? "保存修改" : "创建档案")}</Button>
          <Button variant="outline" onClick={onCancel}>取消</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
