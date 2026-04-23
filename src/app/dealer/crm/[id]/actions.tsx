"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CRM_CONTACT_METHOD_LABEL,
  CRM_CUSTOMER_STAGE_LABEL,
  CRM_CUSTOMER_TYPE_LABEL,
  CRM_INTENT_LEVEL_LABEL,
  CRM_OPPORTUNITY_STAGE_LABEL,
} from "@/lib/utils";

type EditableCustomer = {
  id: string;
  customerType: string;
  name: string;
  phone: string;
  email: string | null;
  wechat: string | null;
  address: string | null;
  region: string | null;
  source: string | null;
  tags: string[];
  stage: string;
  intentLevel: string | null;
  budget: number | null;
  demand: string | null;
  nextFollowAt: string | null;
  remark: string | null;
};

type OpportunityActionRow = {
  id: string;
  title: string;
  stage: string;
};

type TaskActionRow = {
  id: string;
  status: string;
};

export function CrmCustomerActions({
  customer,
  customerId,
  opportunities,
}: {
  customer: EditableCustomer;
  customerId: string;
  opportunities: OpportunityActionRow[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [log, setLog] = useState({ method: "WECHAT", content: "", outcome: "", nextAction: "", nextFollowAt: "", opportunityId: "" });
  const [task, setTask] = useState({ title: "", dueAt: "", reminderContent: "" });
  const [opportunity, setOpportunity] = useState({ title: "", estimatedBudget: "", expectedCloseDate: "", remark: "" });
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({
    customerType: customer.customerType,
    name: customer.name,
    phone: customer.phone,
    email: customer.email ?? "",
    wechat: customer.wechat ?? "",
    address: customer.address ?? "",
    region: customer.region ?? "",
    source: customer.source ?? "",
    tags: customer.tags.join(", "),
    stage: customer.stage,
    intentLevel: customer.intentLevel ?? "",
    budget: customer.budget == null ? "" : String(customer.budget),
    demand: customer.demand ?? "",
    nextFollowAt: toDateTimeInput(customer.nextFollowAt),
    remark: customer.remark ?? "",
  });

  async function submit(url: string, body: any, success: string) {
    setStatus("保存中...");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setStatus("✗ " + json.message);
      return;
    }
    setStatus("✓ " + success);
    router.refresh();
  }

  async function updateCustomer() {
    setStatus("保存中...");
    const res = await fetch(`/api/crm/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...edit,
        email: edit.email || null,
        wechat: edit.wechat || null,
        address: edit.address || null,
        region: edit.region || null,
        source: edit.source || null,
        intentLevel: edit.intentLevel || null,
        budget: edit.budget ? Number(edit.budget) : null,
        demand: edit.demand || null,
        nextFollowAt: edit.nextFollowAt || null,
        remark: edit.remark || null,
        tags: edit.tags.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean),
      }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setStatus("✗ " + json.message);
      return;
    }
    setStatus("✓ 已更新客户资料");
    setEditOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>客户资料维护</CardTitle>
            <Button variant="outline" onClick={() => setEditOpen((value) => !value)}>{editOpen ? "收起" : "编辑"}</Button>
          </div>
        </CardHeader>
        {editOpen && (
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="客户类型">
                <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm" value={edit.customerType} onChange={(e) => setEdit({ ...edit, customerType: e.target.value })}>
                  {Object.entries(CRM_CUSTOMER_TYPE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="阶段">
                <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm" value={edit.stage} onChange={(e) => setEdit({ ...edit, stage: e.target.value })}>
                  {Object.entries(CRM_CUSTOMER_STAGE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="姓名/公司"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="电话"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              <Field label="微信"><Input value={edit.wechat} onChange={(e) => setEdit({ ...edit, wechat: e.target.value })} /></Field>
              <Field label="邮箱"><Input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
              <Field label="地区"><Input value={edit.region} onChange={(e) => setEdit({ ...edit, region: e.target.value })} /></Field>
              <Field label="来源"><Input value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })} /></Field>
              <Field label="意向等级">
                <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm" value={edit.intentLevel} onChange={(e) => setEdit({ ...edit, intentLevel: e.target.value })}>
                  <option value="">未设置</option>
                  {Object.entries(CRM_INTENT_LEVEL_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="预算"><Input type="number" value={edit.budget} onChange={(e) => setEdit({ ...edit, budget: e.target.value })} /></Field>
              <Field label="下次跟进"><Input type="datetime-local" value={edit.nextFollowAt} onChange={(e) => setEdit({ ...edit, nextFollowAt: e.target.value })} /></Field>
              <Field label="标签"><Input value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} /></Field>
            </div>
            <Field label="地址"><Input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
            <Field label="需求"><Textarea value={edit.demand} onChange={(e) => setEdit({ ...edit, demand: e.target.value })} /></Field>
            <Field label="备注"><Textarea value={edit.remark} onChange={(e) => setEdit({ ...edit, remark: e.target.value })} /></Field>
            <Button onClick={updateCustomer} disabled={!edit.name || !edit.phone}>保存资料</Button>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>新增跟进</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="方式">
              <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm" value={log.method} onChange={(e) => setLog({ ...log, method: e.target.value })}>
                {Object.entries(CRM_CONTACT_METHOD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="关联商机">
              <select className="h-10 w-full rounded-xl border border-input bg-white/75 px-3 text-sm" value={log.opportunityId} onChange={(e) => setLog({ ...log, opportunityId: e.target.value })}>
                <option value="">不关联</option>
                {opportunities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </Field>
          </div>
          <Field label="跟进内容"><Textarea value={log.content} onChange={(e) => setLog({ ...log, content: e.target.value })} /></Field>
          <Field label="结果"><Input value={log.outcome} onChange={(e) => setLog({ ...log, outcome: e.target.value })} /></Field>
          <Field label="下一步动作"><Input value={log.nextAction} onChange={(e) => setLog({ ...log, nextAction: e.target.value })} /></Field>
          <Field label="下次跟进时间"><Input type="datetime-local" value={log.nextFollowAt} onChange={(e) => setLog({ ...log, nextFollowAt: e.target.value })} /></Field>
          <Button onClick={() => submit(`/api/crm/customers/${customerId}/logs`, log, "已记录跟进")} disabled={!log.content}>保存跟进</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>新增商机</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="项目名称"><Input value={opportunity.title} onChange={(e) => setOpportunity({ ...opportunity, title: e.target.value })} placeholder="如 李总衣帽间项目" /></Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="预计预算"><Input type="number" value={opportunity.estimatedBudget} onChange={(e) => setOpportunity({ ...opportunity, estimatedBudget: e.target.value })} /></Field>
            <Field label="预计成交日期"><Input type="date" value={opportunity.expectedCloseDate} onChange={(e) => setOpportunity({ ...opportunity, expectedCloseDate: e.target.value })} /></Field>
          </div>
          <Field label="备注"><Textarea value={opportunity.remark} onChange={(e) => setOpportunity({ ...opportunity, remark: e.target.value })} /></Field>
          <Button
            onClick={() => submit(`/api/crm/customers/${customerId}/opportunities`, {
              ...opportunity,
              estimatedBudget: opportunity.estimatedBudget ? Number(opportunity.estimatedBudget) : null,
            }, "已创建商机")}
            disabled={!opportunity.title}
          >
            创建商机
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>新增任务</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="任务标题"><Input value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} placeholder="如 明天微信跟进报价反馈" /></Field>
          <Field label="截止时间"><Input type="datetime-local" value={task.dueAt} onChange={(e) => setTask({ ...task, dueAt: e.target.value })} /></Field>
          <Field label="提醒内容"><Textarea value={task.reminderContent} onChange={(e) => setTask({ ...task, reminderContent: e.target.value })} /></Field>
          <Button onClick={() => submit("/api/crm/tasks", { ...task, customerId }, "已创建任务")} disabled={!task.title || !task.dueAt}>创建任务</Button>
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

export function CrmOpportunityStageControl({ opportunity }: { opportunity: OpportunityActionRow }) {
  const router = useRouter();
  const [stage, setStage] = useState(opportunity.stage);
  const [status, setStatus] = useState("");

  async function updateStage(value: string) {
    setStage(value);
    setStatus("保存中...");
    const res = await fetch(`/api/crm/opportunities/${opportunity.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: value }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setStatus("✗ " + json.message);
      setStage(opportunity.stage);
      return;
    }
    setStatus("✓ 已更新");
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select className="h-9 rounded-xl border border-input bg-white/75 px-3 text-xs" value={stage} onChange={(e) => updateStage(e.target.value)}>
        {Object.entries(CRM_OPPORTUNITY_STAGE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
    </div>
  );
}

export function CrmTaskStatusControls({ task }: { task: TaskActionRow }) {
  const router = useRouter();
  const [status, setStatus] = useState("");

  async function updateTask(nextStatus: string) {
    setStatus("保存中...");
    const res = await fetch(`/api/crm/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setStatus("✗ " + json.message);
      return;
    }
    setStatus("✓ 已更新");
    router.refresh();
  }

  if (task.status !== "PENDING") return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => updateTask("DONE")}>标记完成</Button>
      <Button size="sm" variant="outline" onClick={() => updateTask("CANCELLED")}>取消任务</Button>
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function toDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
