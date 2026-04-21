"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatDate } from "@/lib/utils";

type Contact = {
  role: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  wechat?: string | null;
  isPrimary?: boolean;
  remark?: string | null;
};

type Dealer = {
  id: string;
  dealerNo: string;
  companyName: string;
  contactName: string;
  contactPhone: string;
  legalName?: string | null;
  taxNo?: string | null;
  invoiceTitle?: string | null;
  invoiceType?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  region?: string | null;
  industry?: string | null;
  source?: string | null;
  salesOwner?: string | null;
  creditDays: number;
  allowOverCredit: boolean;
  remark?: string | null;
  priceLevel: string;
  creditLimit: number;
  creditBalance: number;
  paymentMethod: string;
  status: string;
  contacts: Contact[];
  orderCount: number;
  createdAt: string;
};

const PAYMENT_LABELS: Record<string, string> = { PREPAID: "预付款", DEPOSIT: "定金", CREDIT: "信用额度" };

const emptyContact = (): Contact => ({ role: "业务联系人", name: "", phone: "", email: "", wechat: "", isPrimary: false, remark: "" });

export function DealersManager({ initial }: { initial: Dealer[] }) {
  const router = useRouter();
  const [dealers, setDealers] = useState(initial);
  const [editing, setEditing] = useState<Dealer | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [levelFilter, setLevelFilter] = useState("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dealers.filter((d) => {
      const matchesQuery = !q || [d.dealerNo, d.companyName, d.contactName, d.contactPhone, d.region, d.salesOwner]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
      const matchesStatus = statusFilter === "ALL" || d.status === statusFilter;
      const matchesLevel = levelFilter === "ALL" || d.priceLevel === levelFilter;
      return matchesQuery && matchesStatus && matchesLevel;
    });
  }, [dealers, levelFilter, query, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">经销商主数据</h1>
          <p className="text-sm text-muted-foreground">维护客户档案、联系人、开票银行、信用账期与业务负责人</p>
        </div>
        <Button onClick={() => { setCreating(true); setEditing(null); }}>+ 新增经销商</Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-5 md:grid-cols-4 md:pt-6">
          <Input placeholder="搜索编号 / 公司 / 联系人 / 地区 / 负责人" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="h-10 rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">全部状态</option>
            <option value="ACTIVE">启用</option>
            <option value="INACTIVE">停用</option>
          </select>
          <select className="h-10 rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
            <option value="ALL">全部等级</option>
            {["A", "B", "C", "D", "E"].map((lv) => <option key={lv} value={lv}>等级 {lv}</option>)}
          </select>
          <div className="flex items-center text-sm text-muted-foreground">共 {filtered.length} / {dealers.length} 家经销商</div>
        </CardContent>
      </Card>

      {(creating || editing) && (
        <DealerForm
          dealer={editing}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSaved={(d, isNew) => {
            if (isNew) setDealers([{ ...d, orderCount: 0, createdAt: new Date().toISOString() }, ...dealers]);
            else setDealers(dealers.map((x) => x.id === d.id ? { ...x, ...d } : x));
            setCreating(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="border-b bg-white/40"><tr className="text-left">
              <th className="p-3">编号 / 公司</th><th className="p-3">主联系人</th><th className="p-3">地区/行业</th>
              <th className="p-3">负责人</th><th className="p-3">等级</th><th className="p-3">结算</th>
              <th className="p-3 text-right">信用额度</th><th className="p-3 text-right">可用</th>
              <th className="p-3">账期</th><th className="p-3">订单</th><th className="p-3">状态</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {filtered.map((d) => {
                const primary = d.contacts?.find((c) => c.isPrimary) ?? d.contacts?.[0];
                return (
                  <tr key={d.id} className="border-b">
                    <td className="p-3">
                      <div className="font-mono text-xs text-muted-foreground">{d.dealerNo}</div>
                      <div className="font-semibold">{d.companyName}</div>
                      {d.taxNo && <div className="text-xs text-muted-foreground">税号 {d.taxNo}</div>}
                    </td>
                    <td className="p-3">
                      <div>{primary?.name ?? d.contactName}</div>
                      <div className="text-xs text-muted-foreground">{primary?.role ?? "业务联系人"} · {primary?.phone ?? d.contactPhone}</div>
                    </td>
                    <td className="p-3 text-xs">
                      <div>{d.region || "-"}</div>
                      <div className="text-muted-foreground">{d.industry || "-"}</div>
                    </td>
                    <td className="p-3 text-xs">{d.salesOwner || "-"}</td>
                    <td className="p-3"><Badge className="bg-slate-100 text-slate-700">{d.priceLevel}</Badge></td>
                    <td className="p-3 text-xs">{PAYMENT_LABELS[d.paymentMethod] ?? d.paymentMethod}</td>
                    <td className="p-3 text-right">{formatMoney(d.creditLimit)}</td>
                    <td className="p-3 text-right text-emerald-700">{formatMoney(d.creditBalance)}</td>
                    <td className="p-3 text-xs">{d.creditDays ? `${d.creditDays} 天` : "-"}{d.allowOverCredit && <div className="text-amber-600">允许超额</div>}</td>
                    <td className="p-3">{d.orderCount}</td>
                    <td className="p-3">
                      <Badge className={d.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}>
                        {d.status === "ACTIVE" ? "启用" : "停用"}
                      </Badge>
                      <div className="mt-1 text-[11px] text-muted-foreground">{formatDate(d.createdAt)}</div>
                    </td>
                    <td className="p-3"><Button variant="outline" size="sm" onClick={() => { setEditing(d); setCreating(false); }}>编辑</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function DealerForm({ dealer, onCancel, onSaved }: {
  dealer: Dealer | null;
  onCancel: () => void;
  onSaved: (d: any, isNew: boolean) => void;
}) {
  const [form, setForm] = useState({
    dealerNo: dealer?.dealerNo ?? "",
    companyName: dealer?.companyName ?? "",
    contactName: dealer?.contactName ?? "",
    contactPhone: dealer?.contactPhone ?? "",
    legalName: dealer?.legalName ?? "",
    taxNo: dealer?.taxNo ?? "",
    invoiceTitle: dealer?.invoiceTitle ?? "",
    invoiceType: dealer?.invoiceType ?? "增值税普通发票",
    bankName: dealer?.bankName ?? "",
    bankAccount: dealer?.bankAccount ?? "",
    region: dealer?.region ?? "",
    industry: dealer?.industry ?? "",
    source: dealer?.source ?? "",
    salesOwner: dealer?.salesOwner ?? "",
    creditDays: dealer?.creditDays ?? 0,
    allowOverCredit: dealer?.allowOverCredit ?? false,
    remark: dealer?.remark ?? "",
    priceLevel: dealer?.priceLevel ?? "E",
    creditLimit: dealer?.creditLimit ?? 0,
    paymentMethod: dealer?.paymentMethod ?? "PREPAID",
    status: dealer?.status ?? "ACTIVE",
  });
  const [contacts, setContacts] = useState<Contact[]>(
    dealer?.contacts?.length ? dealer.contacts : [{ role: "业务联系人", name: dealer?.contactName ?? "", phone: dealer?.contactPhone ?? "", email: "", wechat: "", isPrimary: true, remark: "" }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const patch = (key: keyof typeof form, value: string | number | boolean) => setForm((f) => ({ ...f, [key]: value }));
  const patchContact = (idx: number, data: Partial<Contact>) => setContacts((rows) => rows.map((r, i) => i === idx ? { ...r, ...data } : r));

  async function submit() {
    setError("");
    setSaving(true);
    try {
      const normalizedContacts = contacts
        .filter((c) => c.name.trim())
        .map((c, idx) => ({ ...c, isPrimary: c.isPrimary || idx === 0 }));
      if (normalizedContacts.length === 0) {
        setError("至少需要一个联系人");
        return;
      }
      const primary = normalizedContacts.find((c) => c.isPrimary) ?? normalizedContacts[0];
      const payload = {
        ...form,
        dealerNo: form.dealerNo.trim(),
        companyName: form.companyName.trim(),
        contactName: primary.name.trim(),
        contactPhone: primary.phone?.trim() || form.contactPhone,
        legalName: form.legalName || null,
        taxNo: form.taxNo || null,
        invoiceTitle: form.invoiceTitle || null,
        invoiceType: form.invoiceType || null,
        bankName: form.bankName || null,
        bankAccount: form.bankAccount || null,
        region: form.region || null,
        industry: form.industry || null,
        source: form.source || null,
        salesOwner: form.salesOwner || null,
        creditLimit: Number(form.creditLimit),
        creditDays: Number(form.creditDays),
        contacts: normalizedContacts,
      };
      const url = dealer ? `/api/dealers/${dealer.id}` : "/api/dealers";
      const method = dealer ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (j.code !== 0) {
        setError(j.message);
        return;
      }
      onSaved({
        ...dealer,
        ...payload,
        id: j.data.id,
        creditBalance: Number(j.data.creditBalance ?? form.creditLimit),
      }, !dealer);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{dealer ? "编辑经销商档案" : "新增经销商档案"}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <section>
          <h3 className="mb-3 text-sm font-bold text-slate-700">基础资料</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="经销商编号"><Input value={form.dealerNo} disabled={!!dealer} onChange={(e) => patch("dealerNo", e.target.value)} placeholder="PARTI-D-0002" /></Field>
            <Field label="公司名称"><Input value={form.companyName} onChange={(e) => patch("companyName", e.target.value)} /></Field>
            <Field label="法定/开票名称"><Input value={form.legalName} onChange={(e) => patch("legalName", e.target.value)} /></Field>
            <Field label="地区"><Input value={form.region} onChange={(e) => patch("region", e.target.value)} placeholder="华东 / 上海" /></Field>
            <Field label="行业"><Input value={form.industry} onChange={(e) => patch("industry", e.target.value)} placeholder="门店 / 工程 / 家装" /></Field>
            <Field label="客户来源"><Input value={form.source} onChange={(e) => patch("source", e.target.value)} /></Field>
            <Field label="销售负责人"><Input value={form.salesOwner} onChange={(e) => patch("salesOwner", e.target.value)} /></Field>
            <Field label="状态">
              <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm" value={form.status} onChange={(e) => patch("status", e.target.value)}>
                <option value="ACTIVE">启用</option><option value="INACTIVE">停用</option>
              </select>
            </Field>
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
          <h3 className="mb-3 text-sm font-bold text-slate-700">结算与信用</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="价格等级">
              <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm" value={form.priceLevel} onChange={(e) => patch("priceLevel", e.target.value)}>
                {["A", "B", "C", "D", "E"].map((lv) => <option key={lv} value={lv}>{lv}</option>)}
              </select>
            </Field>
            <Field label="结算方式">
              <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm" value={form.paymentMethod} onChange={(e) => patch("paymentMethod", e.target.value)}>
                <option value="PREPAID">预付款</option><option value="DEPOSIT">定金</option><option value="CREDIT">信用额度</option>
              </select>
            </Field>
            <Field label="信用额度（元）"><Input type="number" min={0} value={form.creditLimit} onChange={(e) => patch("creditLimit", parseFloat(e.target.value) || 0)} /></Field>
            <Field label="信用账期（天）"><Input type="number" min={0} value={form.creditDays} onChange={(e) => patch("creditDays", parseInt(e.target.value) || 0)} /></Field>
            <Field label="税号"><Input value={form.taxNo} onChange={(e) => patch("taxNo", e.target.value)} /></Field>
            <Field label="发票抬头"><Input value={form.invoiceTitle} onChange={(e) => patch("invoiceTitle", e.target.value)} /></Field>
            <Field label="发票类型"><Input value={form.invoiceType} onChange={(e) => patch("invoiceType", e.target.value)} /></Field>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={form.allowOverCredit} onChange={(e) => patch("allowOverCredit", e.target.checked)} />允许超信用额度下单</label>
            <Field label="开户行"><Input value={form.bankName} onChange={(e) => patch("bankName", e.target.value)} /></Field>
            <Field label="银行账号"><Input value={form.bankAccount} onChange={(e) => patch("bankAccount", e.target.value)} /></Field>
          </div>
        </section>

        <Field label="备注"><Textarea value={form.remark} onChange={(e) => patch("remark", e.target.value)} /></Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button onClick={submit} disabled={saving}>{saving ? "保存中..." : (dealer ? "保存修改" : "创建档案")}</Button>
          <Button variant="outline" onClick={onCancel}>取消</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
