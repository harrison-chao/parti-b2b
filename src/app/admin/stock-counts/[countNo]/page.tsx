import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, STOCK_COUNT_STATUS_LABEL } from "@/lib/utils";
import { ApproveStockCountButton } from "../actions";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-rose-100 text-rose-800",
};

export default async function AdminStockCountDetailPage({ params }: { params: { countNo: string } }) {
  const sc = await prisma.stockCount.findUnique({
    where: { countNo: params.countNo },
    include: {
      workshop: true,
      lines: { orderBy: { sku: "asc" } },
    },
  });
  if (!sc) notFound();

  const totalDiff = sc.lines.reduce((sum, line) => sum + Math.abs(line.diff), 0);
  const positive = sc.lines.filter((line) => line.diff > 0).length;
  const negative = sc.lines.filter((line) => line.diff < 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Link href="/admin/stock-counts" className="text-sm text-blue-600 hover:underline">← 返回盘点审核</Link>
          <h1 className="mt-2 text-2xl font-bold font-mono">{sc.countNo}</h1>
          <p className="text-sm text-muted-foreground">{sc.workshop.name} · 创建 {formatDateTime(sc.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={STATUS_COLOR[sc.status] + " text-base px-3 py-1"}>{STOCK_COUNT_STATUS_LABEL[sc.status]}</Badge>
          {sc.status === "SUBMITTED" && <ApproveStockCountButton countNo={sc.countNo} />}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">SKU 数</div><div className="mt-1 text-2xl font-bold">{sc.lines.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">盘盈项</div><div className="mt-1 text-2xl font-bold text-emerald-700">{positive}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">盘亏项</div><div className="mt-1 text-2xl font-bold text-red-600">{negative}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">差异绝对值</div><div className="mt-1 text-2xl font-bold">{totalDiff}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>盘点信息</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <Info label="提交人" value={sc.submittedBy ?? "-"} />
          <Info label="提交时间" value={sc.submittedAt ? formatDateTime(sc.submittedAt) : "-"} />
          <Info label="审核人" value={sc.approvedBy ?? "-"} />
          <Info label="审核时间" value={sc.approvedAt ? formatDateTime(sc.approvedAt) : "-"} />
          <div className="md:col-span-2"><Info label="备注" value={sc.remark ?? "-"} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>盘点明细</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-white/40"><tr className="text-left">
              <th className="p-3">SKU</th><th className="p-3">名称</th>
              <th className="p-3 text-right">系统</th><th className="p-3 text-right">实盘</th><th className="p-3 text-right">差异</th>
            </tr></thead>
            <tbody>
              {sc.lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="p-3 font-mono text-xs">{line.sku}</td>
                  <td className="p-3">{line.productName}</td>
                  <td className="p-3 text-right">{line.systemQty}</td>
                  <td className="p-3 text-right">{line.actualQty}</td>
                  <td className={`p-3 text-right font-semibold ${line.diff > 0 ? "text-emerald-700" : line.diff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                    {line.diff > 0 ? "+" : ""}{line.diff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}
