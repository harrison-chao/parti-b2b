import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, STOCK_COUNT_STATUS_LABEL } from "@/lib/utils";
import { NewStockCountBtn } from "./new-button";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-rose-100 text-rose-800",
};

export default async function WorkshopStockCountPage() {
  const session = await auth();
  if (!session?.user.workshopId) redirect("/login");

  const counts = await prisma.stockCount.findMany({
    where: { workshopId: session.user.workshopId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { lines: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">库存盘点</h1>
        <NewStockCountBtn />
      </div>

      <Card>
        <CardHeader><CardTitle>盘点单（{counts.length}）</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">单号</th><th className="p-3">状态</th>
              <th className="p-3 text-right">SKU 数</th>
              <th className="p-3">创建时间</th>
              <th className="p-3">审核时间</th>
              <th className="p-3">备注</th>
            </tr></thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-mono">
                    <Link href={`/workshop/stock-count/${c.countNo}`} className="text-blue-600 hover:underline">{c.countNo}</Link>
                  </td>
                  <td className="p-3"><Badge className={STATUS_COLOR[c.status]}>{STOCK_COUNT_STATUS_LABEL[c.status]}</Badge></td>
                  <td className="p-3 text-right">{c._count.lines}</td>
                  <td className="p-3 text-xs">{formatDateTime(c.createdAt)}</td>
                  <td className="p-3 text-xs">{c.approvedAt ? formatDateTime(c.approvedAt) : "-"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{c.remark ?? "-"}</td>
                </tr>
              ))}
              {counts.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">尚无盘点单。点右上「发起盘点」抓取当前库存快照。</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
