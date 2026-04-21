import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listDealerStatements } from "@/lib/reconcile";

export default async function DealerReconcileListPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  const rows = await listDealerStatements();
  const totalReceivable = rows.reduce((s, r) => s + Number(r.receivable), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.paid), 0);
  const totalBalance = rows.reduce((s, r) => s + Number(r.balance), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">经销商对账</h1>
      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">总应收</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">¥{totalReceivable.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">已收款</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-700">¥{totalPaid.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">未收余额</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${totalBalance > 0 ? "text-red-600" : "text-muted-foreground"}`}>¥{totalBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>经销商列表（{rows.length}）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">编号</th><th className="p-3">公司</th>
              <th className="p-3 text-right">订单数</th>
              <th className="p-3 text-right">应收</th>
              <th className="p-3 text-right">已付</th>
              <th className="p-3 text-right">余额</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const bal = Number(r.balance);
                return (
                  <tr key={r.dealerId} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono">
                      <Link href={`/admin/reconcile/dealers/${r.dealerId}`} className="text-blue-600 hover:underline">{r.dealerNo}</Link>
                    </td>
                    <td className="p-3">{r.companyName}</td>
                    <td className="p-3 text-right">{r.orderCount}</td>
                    <td className="p-3 text-right">¥{Number(r.receivable).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className="p-3 text-right text-emerald-700">¥{Number(r.paid).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className={`p-3 text-right font-medium ${bal > 0 ? "text-red-600" : bal < 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                      ¥{bal.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">暂无经销商。</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">应收 = 已确认及以后状态订单总额。草稿/待审/已取消/已拒绝不计入。负余额表示预收。</p>
    </div>
  );
}
