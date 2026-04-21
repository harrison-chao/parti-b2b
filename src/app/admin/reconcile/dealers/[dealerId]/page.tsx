import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDealerStatementDetail } from "@/lib/reconcile";
import { formatDate, formatDateTime, ORDER_STATUS_LABEL } from "@/lib/utils";
import { DealerPaymentPanel } from "./panel";

export default async function DealerStatementPage({ params }: { params: { dealerId: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  const data = await getDealerStatementDetail(params.dealerId);
  if (!data) notFound();
  const { dealer, orders, payments, receivable, paid, balance } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{dealer.companyName}</h1>
          <p className="text-sm text-muted-foreground font-mono">{dealer.dealerNo} · {dealer.contactName} · {dealer.contactPhone}</p>
        </div>
        <Link href="/admin/reconcile/dealers" className="text-sm text-blue-600 hover:underline">← 返回列表</Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">应收</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">¥{Number(receivable).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">已收</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-700">¥{Number(paid).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">余额</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${Number(balance) > 0 ? "text-red-600" : Number(balance) < 0 ? "text-amber-600" : "text-muted-foreground"}`}>¥{Number(balance).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
      </div>

      <DealerPaymentPanel dealerId={dealer.id} payments={payments.map((p) => ({
        id: p.id, amount: p.amount.toString(), paidAt: p.paidAt.toISOString(),
        method: p.method, refNo: p.refNo, note: p.note, recordedBy: p.recordedBy,
      }))} />

      <Card>
        <CardHeader><CardTitle>应收订单（{orders.length}）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">订单号</th>
              <th className="p-3">下单日期</th>
              <th className="p-3">状态</th>
              <th className="p-3 text-right">订单金额</th>
              <th className="p-3 text-right">该订单已付</th>
              <th className="p-3">付款状态</th>
            </tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.orderNo} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-mono">
                    <Link href={`/admin/orders/${o.orderNo}`} className="text-blue-600 hover:underline">{o.orderNo}</Link>
                  </td>
                  <td className="p-3 text-xs">{formatDate(o.orderDate)}</td>
                  <td className="p-3"><Badge>{ORDER_STATUS_LABEL[o.orderStatus] ?? o.orderStatus}</Badge></td>
                  <td className="p-3 text-right">¥{Number(o.totalAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-right text-emerald-700">¥{Number(o.paidAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-xs text-muted-foreground">{o.paymentStatus}</td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">暂无应收订单。</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
