"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CRM_CONTACT_METHOD_LABEL } from "@/lib/utils";

export function CrmCustomerActions({
  customerId,
  opportunities,
}: {
  customerId: string;
  opportunities: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [log, setLog] = useState({ method: "WECHAT", content: "", outcome: "", nextAction: "", nextFollowAt: "", opportunityId: "" });
  const [task, setTask] = useState({ title: "", dueAt: "", reminderContent: "" });
  const [opportunity, setOpportunity] = useState({ title: "", estimatedBudget: "", expectedCloseDate: "", remark: "" });

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

  return (
    <div className="space-y-6">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
