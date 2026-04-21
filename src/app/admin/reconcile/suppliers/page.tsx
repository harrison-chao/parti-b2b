import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listSupplierStatements } from "@/lib/reconcile";

export default async function SupplierReconcileListPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  const rows = await listSupplierStatements();
  const totalPayable = rows.reduce((s, r) => s + Number(r.payable), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.paid), 0);
  const totalBalance = rows.reduce((s, r) => s + Number(r.balance), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">供应商对账</h1>
      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">总应付</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">¥{totalPayable.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">已付款</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-700">¥{totalPaid.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">未付余额</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${totalBalance > 0 ? "text-red-600" : "text-muted-foreground"}`}>¥{totalBalance.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>供应商列表（{rows.length}）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">编号</th><th className="p-3">名称</th>
              <th className="p-3 text-right">PO 数</th>
              <th className="p-3 text-right">应付（按已收货）</th>
              <th className="p-3 text-right">已付</th>
              <th className="p-3 text-right">余额</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const bal = Number(r.balance);
                return (
                  <tr key={r.supplierId} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono">
                      <Link href={`/admin/reconcile/suppliers/${r.supplierId}`} className="text-blue-600 hover:underline">{r.supplierNo}</Link>
                    </td>
                    <td className="p-3">{r.name}</td>
                    <td className="p-3 text-right">{r.poCount}</td>
                    <td className="p-3 text-right">¥{Number(r.payable).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className="p-3 text-right text-emerald-700">¥{Number(r.paid).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                    <td className={`p-3 text-right font-medium ${bal > 0 ? "text-red-600" : bal < 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                      ¥{bal.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">暂无供应商。</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">应付 = Σ（各 PO 行 已收数量 × 单价）。仅已入库部分计入应付。已取消 PO 不计入。</p>
    </div>
  );
}
