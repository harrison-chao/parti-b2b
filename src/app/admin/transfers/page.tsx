import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { TransferForm } from "./form";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");

  const [workshops, transfers] = await Promise.all([
    prisma.workshop.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, inventory: { where: { quantity: { gt: 0 } }, select: { sku: true, productName: true, quantity: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.transferOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { lines: true, fromWorkshop: { select: { name: true } }, toWorkshop: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">库存调拨</h1>
        <p className="text-sm text-muted-foreground">
          总部仓 ↔ 车间仓移库：一次调拨自动生成出库/入库两条流水，数量随行、每米成本随行并按米数加权融合到目标仓均价。
        </p>
      </div>

      <TransferForm workshops={workshops} />

      <Card>
        <CardHeader><CardTitle>调拨记录（近 50 笔）</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-muted/50"><tr className="text-left">
              <th className="p-2">调拨单号</th><th className="p-2">调出</th><th className="p-2">调入</th>
              <th className="p-2">明细</th><th className="p-2">备注</th><th className="p-2">操作人</th><th className="p-2">时间</th>
            </tr></thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="p-2 font-mono text-xs">{t.transferNo}</td>
                  <td className="p-2 text-xs">{t.fromWorkshop.name}</td>
                  <td className="p-2 text-xs">{t.toWorkshop.name}</td>
                  <td className="p-2 text-xs">{t.lines.map((l) => `${l.sku} ×${l.quantity}`).join("、")}</td>
                  <td className="p-2 text-xs text-muted-foreground">{t.note ?? "-"}</td>
                  <td className="p-2 text-xs">{t.operatorName ?? "-"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</td>
                </tr>
              ))}
              {transfers.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">暂无调拨记录</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
