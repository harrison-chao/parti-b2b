"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CRM_CUSTOMER_STAGE_COLOR,
  CRM_CUSTOMER_STAGE_LABEL,
  CRM_CUSTOMER_TYPE_LABEL,
  CRM_INTENT_LEVEL_LABEL,
  formatDate,
  formatMoney,
} from "@/lib/utils";

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  customerType: string;
  stage: string;
  intentLevel: string | null;
  budget: number | null;
  demand: string | null;
  source: string | null;
  tags: string[];
  nextFollowAt: string | null;
  lastContactAt: string | null;
  updatedAt: string;
  counts: { contactLogs: number; opportunities: number; tasks: number; salesOrders: number };
};

type TaskRow = {
  id: string;
  title: string;
  dueAt: string;
  customer: { id: string; name: string; phone: string } | null;
};

export function CrmManager({
  initialCustomers,
  todayTasks,
  overdueTasks,
}: {
  initialCustomers: CustomerRow[];
  todayTasks: TaskRow[];
  overdueTasks: number;
}) {
  const router = useRouter();
  const [customers] = useState(initialCustomers);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("ALL");
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    customerType: "INDIVIDUAL",
    name: "",
    phone: "",
    source: "",
    intentLevel: "MEDIUM",
    budget: "",
    demand: "",
    nextFollowAt: "",
    tags: "",
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((customer) => {
      const scope = [customer.name, customer.phone, customer.demand, customer.source, customer.tags.join(" ")].join(" ").toLowerCase();
      return (stage === "ALL" || customer.stage === stage) && (!q || scope.includes(q));
    });
  }, [customers, query, stage]);

  const highIntent = customers.filter((customer) => customer.intentLevel === "HIGH").length;
  const dueSoon = customers.filter((customer) => customer.nextFollowAt && new Date(customer.nextFollowAt) <= new Date()).length;
  const priorityCustomers = useMemo(() => {
    const now = new Date();
    return [...customers]
      .filter((customer) => customer.stage !== "DEAL" && customer.stage !== "LOST")
      .map((customer) => {
        const nextFollowAt = customer.nextFollowAt ? new Date(customer.nextFollowAt) : null;
        const lastContactAt = customer.lastContactAt ? new Date(customer.lastContactAt) : null;
        let score = 0;
        const reasons: string[] = [];
        if (customer.intentLevel === "HIGH") {
          score += 30;
          reasons.push("高意向");
        }
        if (customer.stage === "QUOTED") {
          score += 24;
          reasons.push("已报价待反馈");
        }
        if (nextFollowAt && nextFollowAt <= now) {
          score += 28;
          reasons.push("到期跟进");
        }
        if (!nextFollowAt) {
          score += 10;
          reasons.push("未设下次跟进");
        }
        if (lastContactAt && now.getTime() - lastContactAt.getTime() > 7 * 24 * 60 * 60 * 1000) {
          score += 18;
          reasons.push("沉默超 7 天");
        }
        if (customer.counts.opportunities > 0) {
          score += 8;
          reasons.push("已有商机");
        }
        return { customer, score, reasons };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [customers]);

  async function createCustomer() {
    setStatus("保存中...");
    const res = await fetch("/api/crm/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerType: form.customerType,
        name: form.name,
        phone: form.phone,
        source: form.source || null,
        intentLevel: form.intentLevel || null,
        budget: form.budget ? Number(form.budget) : null,
        demand: form.demand || null,
        nextFollowAt: form.nextFollowAt || null,
        tags: form.tags.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean),
      }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setStatus("✗ " + json.message);
      return;
    }
    setStatus("✓ 已创建客户");
    setCreating(false);
    router.refresh();
  }

  async function importCustomers() {
    if (!importFile) return;
    setStatus("导入中...");
    const body = new FormData();
    body.append("file", importFile);
    const res = await fetch("/api/crm/customers/import", {
      method: "POST",
      body,
    });
    const json = await res.json();
    if (json.code !== 0) {
      setStatus("✗ " + json.message);
      return;
    }
    const { created, skipped, errors } = json.data;
    setStatus(`✓ 已导入 ${created} 条，跳过 ${skipped} 条${errors.length ? `；${errors[0]}` : ""}`);
    setImporting(false);
    setImportFile(null);
    router.refresh();
  }

  const exportHref = `/api/crm/customers/export?stage=${encodeURIComponent(stage)}&q=${encodeURIComponent(query.trim())}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">客户 CRM</h1>
          <p className="text-sm text-muted-foreground">沉淀线索、客户、商机与跟进任务，把客户经营接到报价订单。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImporting((v) => !v)}>{importing ? "收起导入" : "批量导入 CSV"}</Button>
          <Button variant="outline" asChild><a href={exportHref}>导出当前筛选</a></Button>
          <Button onClick={() => setCreating((v) => !v)}>{creating ? "取消" : "+ 新增客户/线索"}</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="客户/线索" value={customers.length} />
        <Stat title="高意向" value={highIntent} />
        <Stat title="今日待跟进" value={todayTasks.length} />
        <Stat title="逾期待办" value={overdueTasks} tone="text-rose-700" />
      </div>

      {todayTasks.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardHeader><CardTitle>今日建议优先跟进</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {todayTasks.map((task) => (
              <Link key={task.id} href={task.customer ? `/dealer/crm/${task.customer.id}` : "/dealer/crm"} className="rounded-2xl border bg-white/75 p-3 text-sm hover:border-amber-400">
                <div className="font-semibold">{task.title}</div>
                <div className="text-xs text-muted-foreground">{task.customer?.name ?? "未关联客户"} · {formatDate(task.dueAt)}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {priorityCustomers.length > 0 && (
        <Card className="border-sky-200 bg-gradient-to-br from-sky-50/90 to-white">
          <CardHeader><CardTitle>智能优先客户</CardTitle></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {priorityCustomers.map(({ customer, score, reasons }) => (
              <Link key={customer.id} href={`/dealer/crm/${customer.id}`} className="rounded-2xl border bg-white/80 p-3 text-sm hover:border-sky-400">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{customer.name}</span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">{score}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{customer.phone} · {reasons.slice(0, 3).join(" / ")}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {creating && (
        <Card>
          <CardHeader><CardTitle>新增客户/线索</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Field label="客户类型">
              <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm" value={form.customerType} onChange={(e) => setForm({ ...form, customerType: e.target.value })}>
                {Object.entries(CRM_CUSTOMER_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="姓名/公司"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="电话"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="来源"><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="门店 / 小红书 / 转介绍" /></Field>
            <Field label="意向等级">
              <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm" value={form.intentLevel} onChange={(e) => setForm({ ...form, intentLevel: e.target.value })}>
                <option value="HIGH">高意向</option>
                <option value="MEDIUM">中意向</option>
                <option value="LOW">低意向</option>
              </select>
            </Field>
            <Field label="预算"><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></Field>
            <Field label="下次跟进"><Input type="datetime-local" value={form.nextFollowAt} onChange={(e) => setForm({ ...form, nextFollowAt: e.target.value })} /></Field>
            <Field label="标签"><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="高端, 衣帽间, 设计师" /></Field>
            <div className="md:col-span-3"><Field label="需求描述"><Textarea value={form.demand} onChange={(e) => setForm({ ...form, demand: e.target.value })} /></Field></div>
            <div className="flex items-center gap-3 md:col-span-3">
              <Button onClick={createCustomer} disabled={!form.name || !form.phone}>保存</Button>
              {status && <span className="text-sm text-muted-foreground">{status}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {importing && (
        <Card>
          <CardHeader><CardTitle>批量导入客户</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border bg-slate-50/80 p-4 text-sm text-muted-foreground">
              支持从 Excel 另存为 CSV 后上传。建议表头：客户名称、电话、客户类型、微信、邮箱、地区、地址、来源、标签、阶段、意向等级、预算、需求描述、备注、下次跟进时间。
              系统会按手机号去重，重复客户会跳过，不会覆盖已有客户资料。
            </div>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={importCustomers} disabled={!importFile}>开始导入</Button>
              <Button variant="outline" asChild>
                <a href="/api/crm/customers/export">下载现有数据作模板</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-3 pt-5 md:grid-cols-4 md:pt-6">
          <Input placeholder="搜索姓名 / 电话 / 需求 / 来源 / 标签" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="h-10 rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="ALL">全部阶段</option>
            {Object.entries(CRM_CUSTOMER_STAGE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className="flex items-center text-sm text-muted-foreground">共 {filtered.length} / {customers.length} 个客户</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="border-b bg-white/40"><tr className="text-left">
              <th className="p-3">客户</th><th className="p-3">阶段</th><th className="p-3">意向/预算</th><th className="p-3">需求</th>
              <th className="p-3">下次跟进</th><th className="p-3">动态</th><th className="p-3"></th>
            </tr></thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id} className="border-b">
                  <td className="p-3">
                    <div className="font-semibold">{customer.name}</div>
                    <div className="text-xs text-muted-foreground">{CRM_CUSTOMER_TYPE_LABEL[customer.customerType]} · {customer.phone}</div>
                    {customer.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{customer.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px]">{tag}</span>)}</div>}
                  </td>
                  <td className="p-3"><Badge className={CRM_CUSTOMER_STAGE_COLOR[customer.stage]}>{CRM_CUSTOMER_STAGE_LABEL[customer.stage]}</Badge></td>
                  <td className="p-3 text-xs">
                    <div>{customer.intentLevel ? CRM_INTENT_LEVEL_LABEL[customer.intentLevel] : "-"}</div>
                    <div className="text-muted-foreground">{customer.budget != null ? formatMoney(customer.budget) : "-"}</div>
                  </td>
                  <td className="p-3 max-w-sm text-xs">{customer.demand || "-"}</td>
                  <td className="p-3 text-xs">{formatDate(customer.nextFollowAt)}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    跟进 {customer.counts.contactLogs} · 商机 {customer.counts.opportunities} · 订单 {customer.counts.salesOrders}
                  </td>
                  <td className="p-3 text-right"><Link href={`/dealer/crm/${customer.id}`} className="text-blue-600 hover:underline">详情</Link></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">暂无客户，先新增一个线索吧。</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ title, value, tone = "text-slate-950" }: { title: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 md:pt-6">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={`mt-2 text-3xl font-black ${tone}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
