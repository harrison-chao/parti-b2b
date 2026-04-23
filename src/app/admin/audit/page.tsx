import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  USER_PASSWORD_RESET: "重置密码",
  SYSTEM_SETTING_UPDATE: "系统设置",
  INVENTORY_THRESHOLD_UPDATE: "库存阈值",
  DEALER_PAYMENT_DELETE: "删除收款",
  SUPPLIER_PAYMENT_DELETE: "删除付款",
  STOCK_COUNT_APPROVE: "审核盘点",
  WORK_ORDER_STATUS_ADVANCE: "推进工单",
};

export default async function AuditLogPage({ searchParams }: { searchParams: { action?: string; q?: string } }) {
  const action = searchParams.action?.trim();
  const q = searchParams.q?.trim();
  const where: any = {};
  if (action) where.action = action;
  if (q) {
    where.OR = [
      { summary: { contains: q, mode: "insensitive" } },
      { actorName: { contains: q, mode: "insensitive" } },
      { actorEmail: { contains: q, mode: "insensitive" } },
      { entityId: { contains: q, mode: "insensitive" } },
    ];
  }

  const [logs, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">审计日志</h1>
        <p className="text-sm text-muted-foreground">追踪高风险操作：账号、设置、库存、盘点、收付款和工单状态。</p>
      </div>

      <Card>
        <CardContent className="pt-5 md:pt-6">
          <form className="grid gap-3 md:grid-cols-[220px_1fr_100px]">
            <select name="action" defaultValue={action ?? ""} className="h-10 rounded-xl border border-input bg-white/75 px-3 text-sm">
              <option value="">全部动作</option>
              {actions.map((item) => (
                <option key={item.action} value={item.action}>{ACTION_LABEL[item.action] ?? item.action}</option>
              ))}
            </select>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="搜索摘要 / 操作人 / 邮箱 / 对象 ID"
              className="h-10 rounded-xl border border-input bg-white/75 px-3 text-sm shadow-sm"
            />
            <button className="h-10 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white">筛选</button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>最近日志（{logs.length}）</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="border-b bg-slate-50">
              <tr className="text-left">
                <th className="p-3">时间</th>
                <th className="p-3">动作</th>
                <th className="p-3">摘要</th>
                <th className="p-3">操作人</th>
                <th className="p-3">对象</th>
                <th className="p-3">详情</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b align-top">
                  <td className="p-3 text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</td>
                  <td className="p-3"><Badge className="bg-slate-100 text-slate-700">{ACTION_LABEL[log.action] ?? log.action}</Badge></td>
                  <td className="p-3 font-medium">{log.summary}</td>
                  <td className="p-3 text-xs">
                    <div>{log.actorName || "-"}</div>
                    <div className="text-muted-foreground">{log.actorEmail || "-"}</div>
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{log.entityType}{log.entityId ? ` · ${log.entityId}` : ""}</td>
                  <td className="max-w-md p-3">
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-2 text-[11px] text-slate-600">{JSON.stringify(log.detail, null, 2)}</pre>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">暂无审计日志。</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
