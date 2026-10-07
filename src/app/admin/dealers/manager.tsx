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
import { PRICE_TIERS, PRICE_TIER_LABEL } from "@/lib/pricing";

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
  customerType?: "DEALER" | "WALK_IN";
  nickname?: string | null;
  enforcePrepay?: boolean;
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

export function DealersManager({ initial, initialTab = "DEALER" }: { initial: Dealer[]; initialTab?: "DEALER" | "WALK_IN" | "ALL" }) {
  const router = useRouter();
  const [dealers, setDealers] = useState(initial);
  const [editing, setEditing] = useState<Dealer | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedAddrId, setExpandedAddrId] = useState<string | null>(null);
  const [typeTab, setTypeTab] = useState<"DEALER" | "WALK_IN" | "ALL">(initialTab);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [levelFilter, setLevelFilter] = useState("ALL");

  const dealerCount = dealers.filter((d) => (d.customerType ?? "DEALER") === "DEALER").length;
  const directCount = dealers.length - dealerCount;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return dealers.filter((d) => {
      const matchesType = typeTab === "ALL" || (d.customerType ?? "DEALER") === typeTab;
      const matchesQuery = !q || [d.dealerNo, d.companyName, d.nickname, d.contactName, d.contactPhone, d.region, d.salesOwner]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
      const matchesStatus = statusFilter === "ALL" || d.status === statusFilter;
      const matchesLevel = levelFilter === "ALL" || d.priceLevel === levelFilter;
      return matchesType && matchesQuery && matchesStatus && matchesLevel;
    });
  }, [dealers, levelFilter, query, statusFilter, typeTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">客户管理</h1>
          <p className="text-sm text-muted-foreground">经销商与直销客户分列管理；直销客户不参与信用与等级，默认预付款</p>
        </div>
        <Button onClick={() => { setCreating(true); setEditing(null); }}>+ 新增客户</Button>
      </div>

      <div className="flex w-fit rounded-xl border border-input bg-card/60 p-1 text-sm">
        {([
          ["DEALER", `经销商 ${dealerCount}`],
          ["WALK_IN", `直销客户 ${directCount}`],
          ["ALL", `全部 ${dealers.length}`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTypeTab(key)}
            className={`rounded-lg px-4 py-1.5 font-medium transition-colors ${typeTab === key ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-5 md:grid-cols-4 md:pt-6">
          <Input placeholder="搜索编号 / 名称 / 收货人 / 联系人 / 地区 / 负责人" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="h-10 rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">全部状态</option>
            <option value="ACTIVE">启用</option>
            <option value="INACTIVE">停用</option>
          </select>
          <select className="h-10 rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} disabled={typeTab === "WALK_IN"}>
            <option value="ALL">全部等级</option>
            {PRICE_TIERS.map((lv) => <option key={lv} value={lv}>{PRICE_TIER_LABEL[lv]}</option>)}
          </select>
          <div className="flex items-center text-sm text-muted-foreground">
            共 {filtered.length} 家{typeTab === "DEALER" ? "经销商" : typeTab === "WALK_IN" ? "直销客户" : "客户"}
          </div>
        </CardContent>
      </Card>

      {(creating || editing) && (
        <DealerForm
          dealer={editing}
          suggestNo={(type) => suggestDealerNo(dealers, type)}
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
            <thead className="border-b bg-card/40"><tr className="text-left">
              <th className="p-3">编号 / 公司</th><th className="p-3">主联系人</th><th className="p-3">地区/行业</th>
              <th className="p-3">负责人</th><th className="p-3">等级</th><th className="p-3">结算</th>
              <th className="p-3 text-right">信用额度</th><th className="p-3 text-right">可用</th>
              <th className="p-3">账期</th><th className="p-3">订单</th><th className="p-3">状态</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {filtered.map((d) => {
                const primary = d.contacts?.find((c) => c.isPrimary) ?? d.contacts?.[0];
                const isDirect = (d.customerType ?? "DEALER") === "WALK_IN";
                const displayName = isDirect ? (d.nickname || d.companyName) : d.companyName;
                return (
                  <>
                  <tr key={d.id} className="border-b">
                    <td className="p-3">
                      <div className="font-mono text-xs text-muted-foreground">{d.dealerNo}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{displayName}</span>
                        {isDirect
                          ? <Badge className="bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-400/20">直销</Badge>
                          : <Badge className="bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20">经销</Badge>}
                      </div>
                      {isDirect
                        ? <div className="max-w-[240px] truncate text-xs text-muted-foreground" title={d.companyName}>{d.nickname ? d.companyName : d.remark ?? ""}</div>
                        : d.taxNo && <div className="text-xs text-muted-foreground">税号 {d.taxNo}</div>}
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
                    <td className="p-3"><Badge className="bg-secondary text-foreground/80">{PRICE_TIER_LABEL[d.priceLevel as "A"|"B"|"C"] ?? d.priceLevel}</Badge></td>
                    <td className="p-3 text-xs">{PAYMENT_LABELS[d.paymentMethod] ?? d.paymentMethod}</td>
                    <td className="p-3 text-right">{formatMoney(d.creditLimit)}</td>
                    <td className="p-3 text-right text-emerald-300">{formatMoney(d.creditBalance)}</td>
                    <td className="p-3 text-xs">{d.creditDays ? `${d.creditDays} 天` : "-"}{d.allowOverCredit && <div className="text-amber-600">允许超额</div>}</td>
                    <td className="p-3">{d.orderCount}</td>
                    <td className="p-3">
                      <Badge className={d.status === "ACTIVE" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20" : "bg-secondary text-muted-foreground"}>
                        {d.status === "ACTIVE" ? "启用" : "停用"}
                      </Badge>
                      <div className="mt-1 text-[11px] text-muted-foreground">{formatDate(d.createdAt)}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setExpandedAddrId(expandedAddrId === d.id ? null : d.id)}>
                          {expandedAddrId === d.id ? "收起地址" : `地址${(d as any)._addressCount ?? ""}`}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setEditing(d); setCreating(false); }}>编辑</Button>
                        <Button variant="ghost" size="sm" className="text-red-500" onClick={async () => {
                          if (!confirm(`确认删除客户「${d.companyName}」？有订单/账号/付款的客户会被拒绝，请改用停用`)) return;
                          const r = await fetch(`/api/dealers/${d.id}`, { method: "DELETE" });
                          const j = await r.json();
                          if (j.code !== 0) return alert(j.message);
                          setDealers(dealers.filter((x: any) => x.id !== d.id));
                          router.refresh();
                        }}>删除</Button>
                      </div>
                    </td>
                  </tr>
                  {expandedAddrId === d.id && (
                    <tr className="bg-cyan-500/5 border-b">
                      <td colSpan={12} className="p-4">
                        <AddressBookPanel dealerId={d.id} dealerName={displayName} />
                      </td>
                    </tr>
                  )}
                  </>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/** 按类型顺延建议下一个客户编号：经销商 PARTI-D-xxxx / 直销 WI-xxxx（仅占位提示，实际以后端生成为准） */
function suggestDealerNo(list: Dealer[], type: "DEALER" | "WALK_IN") {
  const prefix = type === "WALK_IN" ? "WI-" : "PARTI-D-";
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const max = Math.max(0, ...list.map((d) => {
    const m = re.exec((d.dealerNo ?? "").trim().toUpperCase());
    return m ? parseInt(m[1], 10) : 0;
  }));
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function DealerForm({ dealer, suggestNo, onCancel, onSaved }: {
  dealer: Dealer | null;
  suggestNo: (type: "DEALER" | "WALK_IN") => string;
  onCancel: () => void;
  onSaved: (d: any, isNew: boolean) => void;
}) {
  const [form, setForm] = useState({
    dealerNo: dealer?.dealerNo ?? "",
    companyName: dealer?.companyName ?? "",
    customerType: dealer?.customerType ?? "DEALER" as "DEALER" | "WALK_IN",
    nickname: dealer?.nickname ?? "",
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
    enforcePrepay: dealer?.enforcePrepay ?? false,
    creditDays: dealer?.creditDays ?? 0,
    allowOverCredit: dealer?.allowOverCredit ?? false,
    remark: dealer?.remark ?? "",
    priceLevel: dealer?.priceLevel ?? "C",
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
      const isDirect = form.customerType === "WALK_IN";
      const payload = {
        ...form,
        dealerNo: form.dealerNo.trim(),
        companyName: form.companyName.trim(),
        nickname: form.nickname.trim() || null,
        contactName: primary.name.trim(),
        contactPhone: primary.phone?.trim() || form.contactPhone,
        // 直销客户不参与信用与等级：固定预付款、零信用（先款后产开关独立保留）
        ...(isDirect ? { priceLevel: "C", creditLimit: 0, creditDays: 0, paymentMethod: "PREPAID", allowOverCredit: false } : {}),
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
        // 留空自动生成时回填服务端真实编号，避免列表乐观更新显示空号
        dealerNo: j.data.dealerNo ?? payload.dealerNo,
        creditBalance: Number(j.data.creditBalance ?? form.creditLimit),
      }, !dealer);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>{dealer ? "编辑客户档案" : "新增客户档案"}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <section>
          <h3 className="mb-3 text-sm font-bold text-foreground/80">基础资料</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="客户类型">
              <select className="h-10 w-full rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm" value={form.customerType} onChange={(e) => patch("customerType", e.target.value)}>
                <option value="DEALER">经销商</option>
                <option value="WALK_IN">直销客户</option>
              </select>
            </Field>
            <Field label={form.customerType === "WALK_IN" ? "名称（收货人/称呼）" : "公司名称"}><Input value={form.customerType === "WALK_IN" ? form.nickname : form.companyName} onChange={(e) => patch(form.customerType === "WALK_IN" ? "nickname" : "companyName", e.target.value)} placeholder={form.customerType === "WALK_IN" ? "如：张先生 / xx设计工作室" : ""} /></Field>
            <Field label="客户编号"><Input value={form.dealerNo} disabled={!!dealer} onChange={(e) => patch("dealerNo", e.target.value)} placeholder={`留空自动生成（${suggestNo(form.customerType)} 顺延）`} /></Field>
            {form.customerType === "WALK_IN"
              ? <Field label="收货地址/备注名（可选）"><Input value={form.companyName} onChange={(e) => patch("companyName", e.target.value)} placeholder="如：杭州市余杭区xx路xx号" /></Field>
              : <Field label="法定/开票名称"><Input value={form.legalName} onChange={(e) => patch("legalName", e.target.value)} /></Field>}
            <Field label="地区"><Input value={form.region} onChange={(e) => patch("region", e.target.value)} placeholder="华东 / 上海" /></Field>
            <Field label="行业"><Input value={form.industry} onChange={(e) => patch("industry", e.target.value)} placeholder="门店 / 工程 / 家装" /></Field>
            <Field label="客户来源"><Input value={form.source} onChange={(e) => patch("source", e.target.value)} /></Field>
            <Field label="销售负责人"><Input value={form.salesOwner} onChange={(e) => patch("salesOwner", e.target.value)} /></Field>
            <Field label="状态">
              <select className="h-10 w-full rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm" value={form.status} onChange={(e) => patch("status", e.target.value)}>
                <option value="ACTIVE">启用</option><option value="INACTIVE">停用</option>
              </select>
            </Field>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground/80">联系人</h3>
            <Button size="sm" variant="outline" onClick={() => setContacts([...contacts, emptyContact()])}>+ 添加联系人</Button>
          </div>
          <div className="space-y-2">
            {contacts.map((c, idx) => (
              <div key={idx} className="grid gap-2 rounded-2xl border bg-card/50 p-3 md:grid-cols-7">
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

        {form.customerType === "WALK_IN" ? (
          <section className="space-y-3">
            <section className="rounded-xl border border-dashed border-border/80 bg-card/40 p-4 text-sm text-muted-foreground">
              直销客户不参与信用与等级结算：固定 <span className="text-foreground">预付款</span>、零信用额度。如需信用账期结算，请将客户类型改为「经销商」。
            </section>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.enforcePrepay} onChange={(e) => patch("enforcePrepay", e.target.checked)} />
              先款后产（开启后非内部单须收清才能派单/发货）
            </label>
          </section>
        ) : (
        <section>
          <h3 className="mb-3 text-sm font-bold text-foreground/80">结算与信用</h3>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="价格等级">
              <select className="h-10 w-full rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm" value={form.priceLevel} onChange={(e) => patch("priceLevel", e.target.value)}>
                {PRICE_TIERS.map((lv) => <option key={lv} value={lv}>{PRICE_TIER_LABEL[lv]}</option>)}
              </select>
            </Field>
            <Field label="结算方式">
              <select className="h-10 w-full rounded-xl border border-input bg-card/75 px-3 text-sm shadow-sm" value={form.paymentMethod} onChange={(e) => patch("paymentMethod", e.target.value)}>
                <option value="PREPAID">预付款</option><option value="DEPOSIT">定金</option><option value="CREDIT">信用额度</option>
              </select>
            </Field>
            <Field label="信用额度（元）"><Input type="number" min={0} value={form.creditLimit} onChange={(e) => patch("creditLimit", parseFloat(e.target.value) || 0)} /></Field>
            <Field label="信用账期（天）"><Input type="number" min={0} value={form.creditDays} onChange={(e) => patch("creditDays", parseInt(e.target.value) || 0)} /></Field>
            <Field label="税号"><Input value={form.taxNo} onChange={(e) => patch("taxNo", e.target.value)} /></Field>
            <Field label="发票抬头"><Input value={form.invoiceTitle} onChange={(e) => patch("invoiceTitle", e.target.value)} /></Field>
            <Field label="发票类型"><Input value={form.invoiceType} onChange={(e) => patch("invoiceType", e.target.value)} /></Field>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={form.allowOverCredit} onChange={(e) => patch("allowOverCredit", e.target.checked)} />允许超信用额度下单</label>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={form.enforcePrepay} onChange={(e) => patch("enforcePrepay", e.target.checked)} />先款后产（非内部单须收清才能派单/发货）</label>
            <Field label="开户行"><Input value={form.bankName} onChange={(e) => patch("bankName", e.target.value)} /></Field>
            <Field label="银行账号"><Input value={form.bankAccount} onChange={(e) => patch("bankAccount", e.target.value)} /></Field>
          </div>
        </section>
        )}

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


// ── 客户地址簿面板：代发地址管理（增/删/设默认/打标签）──────────────
function AddressBookPanel({ dealerId, dealerName }: { dealerId: string; dealerName: string }) {
  type Addr = {
    id: string; label?: string | null; addressType?: string | null;
    receiverName: string; receiverPhone: string;
    province: string; city: string; district: string; detailAddress: string; isDefault: boolean;
  };
  const [list, setList] = useState<Addr[] | null>(null);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    label: "", addressType: "dropship" as "warehouse" | "dropship",
    receiverName: "", receiverPhone: "", address: "", isDefault: false,
  });

  async function load() {
    const r = await fetch(`/api/dealers/${dealerId}/addresses`);
    const j = await r.json();
    if (j.code !== 0) { setErr(j.message); return; }
    setList(j.data.addresses);
  }
  if (list === null && !err) void load();

  async function add() {
    if (!form.receiverName || !form.receiverPhone || !form.address) return setErr("收货人、电话、地址必填");
    setErr("");
    const r = await fetch(`/api/dealers/${dealerId}/addresses`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiverName: form.receiverName, receiverPhone: form.receiverPhone,
        detailAddress: form.address, label: form.label || null,
        addressType: form.addressType, isDefault: form.isDefault,
      }),
    });
    const j = await r.json();
    if (j.code !== 0) return setErr(j.message);
    setForm({ label: "", addressType: "dropship", receiverName: "", receiverPhone: "", address: "", isDefault: false });
    setList(null); // 触发重载
  }

  async function patch(id: string, data: Record<string, unknown>) {
    const r = await fetch(`/api/dealers/${dealerId}/addresses/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    });
    const j = await r.json();
    if (j.code !== 0) return setErr(j.message);
    setList(null);
  }

  async function del(a: Addr) {
    if (!confirm(`删除地址「${a.label ?? a.receiverName}」？不影响已创建的订单`)) return;
    const r = await fetch(`/api/dealers/${dealerId}/addresses/${a.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.code !== 0) return setErr(j.message);
    setList(null);
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{dealerName} 的地址簿（代发=直发他的终端客户）</div>
      {err && <div className="text-xs text-red-400">{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-xs">
          <thead className="border-b bg-card/40"><tr className="text-left">
            <th className="p-2">标签</th><th className="p-2">类型</th><th className="p-2">收货人</th>
            <th className="p-2">电话</th><th className="p-2">地址</th><th className="p-2">默认</th><th className="p-2"></th>
          </tr></thead>
          <tbody>
            {(list ?? []).map((a) => (
              <tr key={a.id} className="border-b">
                <td className="p-2">
                  <input className="border rounded px-1 py-0.5 w-36 bg-card" defaultValue={a.label ?? ""}
                    placeholder="终端客户/门店名"
                    onBlur={(e) => { if ((e.target.value || null) !== (a.label ?? null)) void patch(a.id, { label: e.target.value || null }); }} />
                </td>
                <td className="p-2">
                  <select className="border rounded px-1 py-0.5 bg-card" value={a.addressType ?? "warehouse"}
                    onChange={(e) => void patch(a.id, { addressType: e.target.value })}>
                    <option value="dropship">代发</option>
                    <option value="warehouse">自用</option>
                  </select>
                </td>
                <td className="p-2">{a.receiverName}</td>
                <td className="p-2">{a.receiverPhone}</td>
                <td className="p-2 max-w-[320px] truncate" title={`${a.province}${a.city}${a.district}${a.detailAddress}`}>
                  {a.province}{a.city}{a.district}{a.detailAddress}
                </td>
                <td className="p-2">
                  {a.isDefault ? <span className="text-sky-300">默认</span> : (
                    <button className="text-sky-400 hover:underline" onClick={() => void patch(a.id, { isDefault: true })}>设为默认</button>
                  )}
                </td>
                <td className="p-2"><button className="text-red-400 hover:underline" onClick={() => void del(a)}>删除</button></td>
              </tr>
            ))}
            {list !== null && list.length === 0 && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">暂无地址——在下方添加，或下单时勾选“保存到该客户地址簿”自动沉淀</td></tr>}
            {list === null && <tr><td colSpan={7} className="p-3 text-center text-muted-foreground">加载中…</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-t pt-2">
        <div><Label className="text-xs">标签</Label><Input className="h-8 w-40" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="如 代发·杭州店" /></div>
        <div>
          <Label className="text-xs">类型</Label>
          <select className="h-8 border rounded px-2 text-sm bg-card" value={form.addressType} onChange={(e) => setForm({ ...form, addressType: e.target.value as "warehouse" | "dropship" })}>
            <option value="dropship">代发</option>
            <option value="warehouse">自用</option>
          </select>
        </div>
        <div><Label className="text-xs">收货人</Label><Input className="h-8 w-32" value={form.receiverName} onChange={(e) => setForm({ ...form, receiverName: e.target.value })} /></div>
        <div><Label className="text-xs">电话</Label><Input className="h-8 w-32" value={form.receiverPhone} onChange={(e) => setForm({ ...form, receiverPhone: e.target.value })} /></div>
        <div className="flex-1 min-w-[280px]"><Label className="text-xs">地址</Label><Input className="h-8" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <label className="flex items-center gap-1.5 text-xs pb-1.5">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />默认
        </label>
        <Button size="sm" onClick={add}>+ 添加地址</Button>
      </div>
    </div>
  );
}
