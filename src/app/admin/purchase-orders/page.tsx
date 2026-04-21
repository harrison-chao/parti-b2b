import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatDate, PURCHASE_ORDER_STATUS_LABEL, PURCHASE_ORDER_STATUS_COLOR } from "@/lib/utils";

export default async function PurchaseOrdersPage() {
  const pos = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { supplierNo: true, name: true } },
      workshop: { select: { code: true, name: true } },
      _count: { select: { lines: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">采购单</h1>
        <Link href="/admin/purchase-orders/new"><Button size="sm">+ 新建采购单</Button></Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">单号</th><th className="p-3">供应商</th>
              <th className="p-3">目标车间</th><th className="p-3">下单日</th>
              <th className="p-3">期望到货</th><th className="p-3 text-right">行数</th>
              <th className="p-3 text-right">金额</th><th className="p-3">状态</th>
            </tr></thead>
            <tbody>
              {pos.map((p) => (
                <tr key={p.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-mono"><Link href={`/admin/purchase-orders/${p.poNo}`} className="text-blue-600 hover:underline">{p.poNo}</Link></td>
                  <td className="p-3">{p.supplier.name}</td>
                  <td className="p-3">{p.workshop.name}</td>
                  <td className="p-3 text-xs">{formatDate(p.orderDate)}</td>
                  <td className="p-3 text-xs">{p.expectedDate ? formatDate(p.expectedDate) : "-"}</td>
                  <td className="p-3 text-right">{p._count.lines}</td>
                  <td className="p-3 text-right font-medium">{formatMoney(Number(p.totalAmount))}</td>
                  <td className="p-3"><Badge className={PURCHASE_ORDER_STATUS_COLOR[p.status]}>{PURCHASE_ORDER_STATUS_LABEL[p.status]}</Badge></td>
                </tr>
              ))}
              {pos.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">暂无采购单</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
