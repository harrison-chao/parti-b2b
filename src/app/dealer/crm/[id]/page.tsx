import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CRM_CONTACT_METHOD_LABEL,
  CRM_CUSTOMER_STAGE_COLOR,
  CRM_CUSTOMER_STAGE_LABEL,
  CRM_CUSTOMER_TYPE_LABEL,
  CRM_INTENT_LEVEL_LABEL,
  CRM_OPPORTUNITY_STAGE_LABEL,
  CRM_TASK_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  formatDate,
  formatDateTime,
  formatMoney,
} from "@/lib/utils";
import { CrmCustomerActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function CrmCustomerDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const customer = await prisma.crmCustomer.findFirst({
    where: { id: params.id, dealerId: session!.user.dealerId! },
    include: {
      contactLogs: { orderBy: { createdAt: "desc" }, include: { opportunity: { select: { title: true } } } },
      opportunities: { orderBy: { updatedAt: "desc" } },
      tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }] },
      salesOrders: { orderBy: { createdAt: "desc" }, select: { orderNo: true, orderStatus: true, totalAmount: true, createdAt: true } },
    },
  });
  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/dealer/crm" className="text-sm text-blue-600 hover:underline">← 返回客户 CRM</Link>
          <h1 className="mt-2 text-2xl font-bold">{customer.name}</h1>
          <p className="text-sm text-muted-foreground">{CRM_CUSTOMER_TYPE_LABEL[customer.customerType]} · {customer.phone}</p>
        </div>
        <Badge className={CRM_CUSTOMER_STAGE_COLOR[customer.stage]}>{CRM_CUSTOMER_STAGE_LABEL[customer.stage]}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle>客户资料</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Info label="电话" value={customer.phone} />
            <Info label="微信" value={customer.wechat || "-"} />
            <Info label="邮箱" value={customer.email || "-"} />
            <Info label="地区" value={customer.region || "-"} />
            <Info label="来源" value={customer.source || "-"} />
            <Info label="意向" value={customer.intentLevel ? CRM_INTENT_LEVEL_LABEL[customer.intentLevel] : "-"} />
            <Info label="预算" value={customer.budget != null ? formatMoney(Number(customer.budget)) : "-"} />
            <Info label="下次跟进" value={formatDateTime(customer.nextFollowAt)} />
            <div className="md:col-span-2"><Info label="地址" value={customer.address || "-"} /></div>
            <div className="md:col-span-2"><Info label="需求" value={customer.demand || "-"} /></div>
            <div className="md:col-span-2"><Info label="备注" value={customer.remark || "-"} /></div>
            {customer.tags.length > 0 && (
              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-muted-foreground">标签</div>
                <div className="flex flex-wrap gap-1">{customer.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{tag}</span>)}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <CrmCustomerActions
          customerId={customer.id}
          opportunities={customer.opportunities.map((opportunity) => ({ id: opportunity.id, title: opportunity.title }))}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>跟进记录</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {customer.contactLogs.map((log) => (
              <div key={log.id} className="rounded-2xl border bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold">{CRM_CONTACT_METHOD_LABEL[log.method]}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm">{log.content}</p>
                {log.outcome && <p className="mt-1 text-xs text-muted-foreground">结果：{log.outcome}</p>}
                {log.nextAction && <p className="mt-1 text-xs text-blue-700">下一步：{log.nextAction}</p>}
                {log.opportunity && <p className="mt-1 text-xs text-muted-foreground">关联商机：{log.opportunity.title}</p>}
              </div>
            ))}
            {customer.contactLogs.length === 0 && <p className="text-sm text-muted-foreground">暂无跟进记录。</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>商机项目</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {customer.opportunities.map((opportunity) => (
              <div key={opportunity.id} className="rounded-2xl border bg-white/70 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{opportunity.title}</span>
                  <Badge className="bg-slate-100 text-slate-700">{CRM_OPPORTUNITY_STAGE_LABEL[opportunity.stage]}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  预计预算 {opportunity.estimatedBudget != null ? formatMoney(Number(opportunity.estimatedBudget)) : "-"} · 预计成交 {formatDate(opportunity.expectedCloseDate)}
                </div>
                {opportunity.remark && <p className="mt-2 text-xs">{opportunity.remark}</p>}
              </div>
            ))}
            {customer.opportunities.length === 0 && <p className="text-sm text-muted-foreground">暂无商机。</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>跟进任务</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {customer.tasks.map((task) => (
              <div key={task.id} className="rounded-2xl border bg-white/70 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{task.title}</span>
                  <span className="text-xs text-muted-foreground">{CRM_TASK_STATUS_LABEL[task.status]} · {formatDateTime(task.dueAt)}</span>
                </div>
                {task.reminderContent && <p className="mt-2 text-xs text-muted-foreground">{task.reminderContent}</p>}
              </div>
            ))}
            {customer.tasks.length === 0 && <p className="text-sm text-muted-foreground">暂无任务。</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>关联订单</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {customer.salesOrders.map((order) => (
              <Link key={order.orderNo} href={`/dealer/orders/${order.orderNo}`} className="block rounded-2xl border bg-white/70 p-3 text-sm hover:border-primary/40">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono">{order.orderNo}</span>
                  <span>{formatMoney(Number(order.totalAmount))}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{ORDER_STATUS_LABEL[order.orderStatus]} · {formatDate(order.createdAt)}</div>
              </Link>
            ))}
            {customer.salesOrders.length === 0 && <p className="text-sm text-muted-foreground">暂无关联订单。</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
