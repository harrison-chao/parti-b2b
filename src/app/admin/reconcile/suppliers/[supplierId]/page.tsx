import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSupplierStatementDetail } from "@/lib/reconcile";
import { formatDate, PURCHASE_ORDER_STATUS_LABEL } from "@/lib/utils";
import { SupplierPaymentPanel } from "./panel";

export default async function SupplierStatementPage({ params }: { params: { supplierId: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  const data = await getSupplierStatementDetail(params.supplierId);
  if (!data) notFound();
  const { supplier, pos, payments, payable, paid, balance } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{supplier.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{supplier.supplierNo}{supplier.contactName ? ` · ${supplier.contactName}` : ""}{supplier.contactPhone ? ` · ${supplier.contactPhone}` : ""}</p>
        </div>
        <Link href="/admin/reconcile/suppliers" className="text-sm text-blue-600 hover:underline">← 返回列表</Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">应付</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">¥{Number(payable).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">已付</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-700">¥{Number(paid).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">余额</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${Number(balance) > 0 ? "text-red-600" : Number(balance) < 0 ? "text-amber-600" : "text-muted-foreground"}`}>¥{Number(balance).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</CardContent></Card>
      </div>

      <SupplierPaymentPanel supplierId={supplier.id} payments={payments.map((p) => ({
        id: p.id, amount: p.amount.toString(), paidAt: p.paidAt.toISOString(),
        method: p.method, refNo: p.refNo, note: p.note, recordedBy: p.recordedBy,
      }))} />

      <Card>
        <CardHeader><CardTitle>采购订单（{pos.length}）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">单号</th>
              <th className="p-3">下单日期</th>
              <th className="p-3">收货车间</th>
              <th className="p-3">状态</th>
              <th className="p-3 text-right">订单金额</th>
              <th className="p-3 text-right">已收货金额</th>
              <th className="p-3 text-right">已付</th>
              <th className="p-3 text-right">未付</th>
            </tr></thead>
            <tbody>
              {pos.map((p) => (
                <tr key={p.poNo} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-mono">
                    <Link href={`/admin/purchase-orders/${p.poNo}`} className="text-blue-600 hover:underline">{p.poNo}</Link>
                  </td>
                  <td className="p-3 text-xs">{formatDate(p.orderDate)}</td>
                  <td className="p-3">{p.workshopName}</td>
                  <td className="p-3"><Badge>{PURCHASE_ORDER_STATUS_LABEL[p.status] ?? p.status}</Badge></td>
                  <td className="p-3 text-right">¥{Number(p.orderedAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-right font-medium">¥{Number(p.receivedAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-right text-emerald-700">¥{Number(p.paidAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-right text-red-600">¥{Number(p.unpaidAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {pos.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">暂无采购单。</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
