import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listDealerStatements } from "@/lib/reconcile";

const TYPE_TABS = [
  { key: "", label: "全部" },
  { key: "DEALER", label: "经销商" },
  { key: "WALK_IN", label: "直销客户" },
] as const;

export default async function DealerReconcileListPage({ searchParams }: { searchParams: { type?: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  const all = await listDealerStatements();
  const typeFilter = searchParams.type === "DEALER" || searchParams.type === "WALK_IN" ? searchParams.type : "";
  const rows = typeFilter ? all.filter((r) => r.customerType === typeFilter) : all;
  const dealerTotal = all.filter((r) => r.customerType === "DEALER").length;
  const totalReceivable = rows.reduce((s, r) => s + Number(r.receivable), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.paid), 0);
  const totalBalance = rows.reduce((s, r) => s + Number(r.balance), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">客户对账</h1>
      <div className="flex w-fit rounded-xl border border-input bg-card/60 p-1 text-sm">
        {TYPE_TABS.map((t) => {
          const active = typeFilter === t.key;
          const count = t.key === "" ? all.length : t.key === "DEALER" ? dealerTotal : all.length - dealerTotal;
          return (
            <Link
              key={t.key || "ALL"}
              href={t.key ? `/admin/reconcile/dealers?type=${t.key}` : "/admin/reconcile/dealers"}
              className={`rounded-lg px-4 py-1.5 font-medium transition-colors ${active ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label} {count}
            </Link>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">总应收</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">¥{totalReceivable.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">已收款</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-300">¥{totalPaid.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">未收余额</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${totalBalance > 0 ? "text-red-400" : "text-muted-foreground"}`}>¥{totalBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>客户列表（{rows.length}）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b"><tr className="text-left">
                <th className="p-3">编号</th><th className="p-3">客户</th><th className="p-3">类型</th>
                <th className="p-3 text-right">订单数</th>
                <th className="p-3 text-right">应收</th>
                <th className="p-3 text-right">已付</th>
                <th className="p-3 text-right">余额</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const bal = Number(r.balance);
                  const isDirect = r.customerType === "WALK_IN";
                  return (
                    <tr key={r.dealerId} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-mono">
                        <Link href={`/admin/reconcile/dealers/${r.dealerId}`} className="text-sky-400 hover:underline">{r.dealerNo}</Link>
                      </td>
                      <td className="p-3">{isDirect ? (r.nickname || r.companyName) : r.companyName}</td>
                      <td className="p-3">
                        {isDirect
                          ? <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[11px] text-cyan-300 ring-1 ring-inset ring-cyan-400/20">直销</span>
                          : <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] text-blue-300 ring-1 ring-inset ring-blue-400/20">经销</span>}
                      </td>
                      <td className="p-3 text-right">{r.orderCount}</td>
                      <td className="p-3 text-right">¥{Number(r.receivable).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right text-emerald-300">¥{Number(r.paid).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                      <td className={`p-3 text-right font-medium ${bal > 0 ? "text-red-400" : bal < 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        ¥{bal.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">暂无客户。</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">应收 = 已确认及以后状态订单总额。草稿/待审/已取消/已拒绝不计入。负余额表示预收。经销商与直销客户统一对账，可用上方页签切换。</p>
    </div>
  );
}
