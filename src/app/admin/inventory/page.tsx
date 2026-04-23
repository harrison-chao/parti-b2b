import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const items = await prisma.workshopInventory.findMany({
    orderBy: [{ workshop: { name: "asc" } }, { sku: "asc" }],
    include: { workshop: { select: { code: true, name: true } } },
  });
  const lowStock = items.filter((item) => item.lowStockThreshold > 0 && item.quantity <= item.lowStockThreshold);
  const negative = items.filter((item) => item.quantity < 0);
  const noThreshold = items.filter((item) => item.lowStockThreshold === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">库存预警</h1>
        <p className="text-sm text-muted-foreground">跨车间查看低库存与负库存。低库存阈值由车间库存页维护。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="库存 SKU" value={items.length} />
        <Stat title="低库存" value={lowStock.length} tone="text-amber-700" />
        <Stat title="负库存" value={negative.length} tone="text-rose-700" />
        <Stat title="未设阈值" value={noThreshold.length} tone="text-slate-500" />
      </div>

      <Card className={lowStock.length > 0 ? "border-amber-200" : ""}>
        <CardHeader><CardTitle>低库存 / 负库存明细</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b bg-slate-50">
              <tr className="text-left">
                <th className="p-3">车间</th>
                <th className="p-3">SKU</th>
                <th className="p-3">名称</th>
                <th className="p-3 text-right">现货</th>
                <th className="p-3 text-right">阈值</th>
                <th className="p-3">状态</th>
                <th className="p-3">最近更新</th>
              </tr>
            </thead>
            <tbody>
              {[...negative, ...lowStock.filter((item) => item.quantity >= 0)].map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="p-3">{item.workshop.name} <span className="font-mono text-xs text-muted-foreground">({item.workshop.code})</span></td>
                  <td className="p-3 font-mono text-xs">{item.sku}</td>
                  <td className="p-3">{item.productName}</td>
                  <td className={`p-3 text-right font-semibold ${item.quantity < 0 ? "text-rose-700" : "text-amber-700"}`}>{item.quantity}</td>
                  <td className="p-3 text-right">{item.lowStockThreshold || "-"}</td>
                  <td className="p-3">
                    {item.quantity < 0 ? <Badge className="bg-rose-100 text-rose-700">负库存</Badge> : <Badge className="bg-amber-100 text-amber-800">低库存</Badge>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{formatDateTime(item.updatedAt)}</td>
                </tr>
              ))}
              {lowStock.length === 0 && negative.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">当前没有低库存或负库存。</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ title, value, tone = "text-slate-950" }: { title: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={`mt-2 text-3xl font-black ${tone}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
