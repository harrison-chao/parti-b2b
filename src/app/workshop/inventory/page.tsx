import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, STOCK_MOVEMENT_TYPE_LABEL } from "@/lib/utils";

export default async function WorkshopInventoryPage() {
  const session = await auth();
  if (!session?.user.workshopId) redirect("/login");

  const [items, recentMovements] = await Promise.all([
    prisma.workshopInventory.findMany({
      where: { workshopId: session.user.workshopId },
      orderBy: { sku: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { workshopId: session.user.workshopId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const lowStock = items.filter((i) => i.lowStockThreshold > 0 && i.quantity <= i.lowStockThreshold);
  const negative = items.filter((i) => i.quantity < 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">车间库存</h1>
        <div className="flex gap-2 text-sm">
          {negative.length > 0 && <Badge className="bg-red-100 text-red-700">⚠ 负库存 {negative.length}</Badge>}
          {lowStock.length > 0 && <Badge className="bg-amber-100 text-amber-800">⚠ 低库存 {lowStock.length}</Badge>}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>现货（{items.length}）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">SKU</th><th className="p-3">名称</th>
              <th className="p-3 text-right">现货数量</th>
              <th className="p-3 text-right">低库存阈值</th>
              <th className="p-3">状态</th>
              <th className="p-3 text-xs">最近更新</th>
            </tr></thead>
            <tbody>
              {items.map((i) => {
                const isNeg = i.quantity < 0;
                const isLow = !isNeg && i.lowStockThreshold > 0 && i.quantity <= i.lowStockThreshold;
                return (
                  <tr key={i.id} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono text-xs">{i.sku}</td>
                    <td className="p-3">{i.productName}</td>
                    <td className={`p-3 text-right font-medium ${isNeg ? "text-red-600" : isLow ? "text-amber-700" : ""}`}>{i.quantity}</td>
                    <td className="p-3 text-right text-xs text-muted-foreground">{i.lowStockThreshold > 0 ? i.lowStockThreshold : "-"}</td>
                    <td className="p-3">
                      {isNeg ? <Badge className="bg-red-100 text-red-700">负库存</Badge>
                        : isLow ? <Badge className="bg-amber-100 text-amber-800">低库存</Badge>
                        : <Badge className="bg-emerald-100 text-emerald-700">正常</Badge>}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{formatDateTime(i.updatedAt)}</td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">尚无库存，等采购到货或盘点录入</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>最近流水（50）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">时间</th><th className="p-3">SKU</th>
              <th className="p-3">名称</th><th className="p-3">类型</th>
              <th className="p-3 text-right">变动</th><th className="p-3 text-right">结存</th>
              <th className="p-3">单据</th><th className="p-3">备注</th>
            </tr></thead>
            <tbody>
              {recentMovements.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="p-3 text-xs">{formatDateTime(m.createdAt)}</td>
                  <td className="p-3 font-mono text-xs">{m.sku}</td>
                  <td className="p-3">{m.productName}</td>
                  <td className="p-3 text-xs">{STOCK_MOVEMENT_TYPE_LABEL[m.type]}</td>
                  <td className={`p-3 text-right ${m.quantity >= 0 ? "text-emerald-700" : "text-red-600"}`}>{m.quantity >= 0 ? "+" : ""}{m.quantity}</td>
                  <td className="p-3 text-right">{m.balanceAfter}</td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">{m.refType ? `${m.refType} · ${m.refNo}` : "-"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{m.note ?? "-"}</td>
                </tr>
              ))}
              {recentMovements.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">暂无流水</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
