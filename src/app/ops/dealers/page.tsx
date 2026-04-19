import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate } from "@/lib/utils";

export default async function OpsDealersPage() {
  const dealers = await prisma.dealer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { salesOrders: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">经销商管理</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">编号</th><th className="p-3">公司</th><th className="p-3">联系人</th>
              <th className="p-3">等级</th><th className="p-3">结算</th>
              <th className="p-3 text-right">信用额度</th><th className="p-3 text-right">可用</th>
              <th className="p-3">订单数</th><th className="p-3">注册</th><th className="p-3">状态</th>
            </tr></thead>
            <tbody>
              {dealers.map((d) => (
                <tr key={d.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-mono">{d.dealerNo}</td>
                  <td className="p-3 font-medium">{d.companyName}</td>
                  <td className="p-3">{d.contactName}<div className="text-xs text-muted-foreground">{d.contactPhone}</div></td>
                  <td className="p-3"><Badge className="bg-slate-100 text-slate-700">{d.priceLevel}</Badge></td>
                  <td className="p-3 text-xs">{d.paymentMethod}</td>
                  <td className="p-3 text-right">{formatMoney(Number(d.creditLimit))}</td>
                  <td className="p-3 text-right text-emerald-700">{formatMoney(Number(d.creditBalance))}</td>
                  <td className="p-3">{d._count.salesOrders}</td>
                  <td className="p-3">{formatDate(d.createdAt)}</td>
                  <td className="p-3"><Badge className={d.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}>{d.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
