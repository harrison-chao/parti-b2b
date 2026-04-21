import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, STOCK_COUNT_STATUS_LABEL } from "@/lib/utils";
import { ApproveStockCountButton } from "./actions";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-rose-100 text-rose-800",
};

export default async function AdminStockCountsPage() {
  const counts = await prisma.stockCount.findMany({
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    include: {
      workshop: { select: { code: true, name: true } },
      lines: { select: { diff: true } },
      _count: { select: { lines: true } },
    },
  });

  const submitted = counts.filter((c) => c.status === "SUBMITTED").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">盘点审核</h1>
        <p className="text-sm text-muted-foreground">车间提交后由管理员审核，审核通过才写入库存调整流水。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">待审核</div><div className="mt-1 text-3xl font-bold text-blue-700">{submitted}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">盘点单总数</div><div className="mt-1 text-3xl font-bold">{counts.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">已审核</div><div className="mt-1 text-3xl font-bold text-emerald-700">{counts.filter((c) => c.status === "APPROVED").length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>盘点单列表</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b bg-white/40"><tr className="text-left">
              <th className="p-3">单号</th><th className="p-3">车间</th><th className="p-3">状态</th>
              <th className="p-3 text-right">SKU 数</th><th className="p-3 text-right">盈</th><th className="p-3 text-right">亏</th>
              <th className="p-3">提交</th><th className="p-3">审核</th><th className="p-3">操作</th>
            </tr></thead>
            <tbody>
              {counts.map((c) => {
                const positive = c.lines.filter((l) => l.diff > 0).length;
                const negative = c.lines.filter((l) => l.diff < 0).length;
                return (
                  <tr key={c.id} className="border-b">
                    <td className="p-3 font-mono">
                      <Link href={`/admin/stock-counts/${c.countNo}`} className="text-blue-600 hover:underline">{c.countNo}</Link>
                    </td>
                    <td className="p-3"><div>{c.workshop.name}</div><div className="text-xs text-muted-foreground">{c.workshop.code}</div></td>
                    <td className="p-3"><Badge className={STATUS_COLOR[c.status]}>{STOCK_COUNT_STATUS_LABEL[c.status]}</Badge></td>
                    <td className="p-3 text-right">{c._count.lines}</td>
                    <td className="p-3 text-right text-emerald-700">{positive}</td>
                    <td className="p-3 text-right text-red-600">{negative}</td>
                    <td className="p-3 text-xs">{c.submittedAt ? <>{formatDateTime(c.submittedAt)}<div className="text-muted-foreground">{c.submittedBy}</div></> : "-"}</td>
                    <td className="p-3 text-xs">{c.approvedAt ? <>{formatDateTime(c.approvedAt)}<div className="text-muted-foreground">{c.approvedBy}</div></> : "-"}</td>
                    <td className="p-3">{c.status === "SUBMITTED" ? <ApproveStockCountButton countNo={c.countNo} /> : <span className="text-xs text-muted-foreground">-</span>}</td>
                  </tr>
                );
              })}
              {counts.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">暂无盘点单</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
