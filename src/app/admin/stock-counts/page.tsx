import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, STOCK_COUNT_STATUS_LABEL } from "@/lib/utils";
import { ApproveStockCountButton } from "./actions";
import { getAbcClassification } from "@/lib/inventory-analytics";
import { formatMoney } from "@/lib/utils";


async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-secondary text-foreground/80",
  SUBMITTED: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/20",
  APPROVED: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
  CANCELLED: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/20",
};

export default async function AdminStockCountsPage() {
  await requireAdmin();
  const [counts, abc] = await Promise.all([
    prisma.stockCount.findMany({
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    include: {
      workshop: { select: { code: true, name: true } },
      lines: { select: { diff: true } },
      _count: { select: { lines: true } },
    },
  }),
  getAbcClassification(prisma),
  ]);

  const submitted = counts.filter((c) => c.status === "SUBMITTED").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">盘点审核</h1>
        <p className="text-sm text-muted-foreground">车间提交后由管理员审核，审核通过才写入库存调整流水。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">待审核</div><div className="mt-1 text-3xl font-bold text-sky-300">{submitted}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">盘点单总数</div><div className="mt-1 text-3xl font-bold">{counts.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">已审核</div><div className="mt-1 text-3xl font-bold text-emerald-300">{counts.filter((c) => c.status === "APPROVED").length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ABC 分类与盘点计划（近 90 天消耗价值）</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            A 类（累计消耗价值 ≤70%）建议每月盘，B 类（≤90%）每季盘，C 类每半年盘。下次应盘日 = 上次盘点批准日 + 周期；从未盘过的立即应盘。已过期标红。
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-card/40"><tr className="text-left">
              <th className="p-2">等级</th><th className="p-2">SKU</th><th className="p-2 text-right">90天消耗价值</th>
              <th className="p-2 text-right">占比</th><th className="p-2 text-right">累计</th>
              <th className="p-2 text-right">盘点周期</th><th className="p-2">上次盘点</th><th className="p-2">下次应盘</th>
            </tr></thead>
            <tbody>
              {abc.map((r) => {
                const overdue = r.nextDueAt.getTime() <= Date.now();
                return (
                  <tr key={r.sku} className="border-b">
                    <td className="p-2">
                      <Badge className={r.klass === "A" ? "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/20" : r.klass === "B" ? "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/20" : "bg-secondary text-foreground/80"}>{r.klass}</Badge>
                    </td>
                    <td className="p-2 font-mono text-xs">{r.sku}</td>
                    <td className="p-2 text-right text-xs">{formatMoney(r.value90d)}</td>
                    <td className="p-2 text-right text-xs">{r.share}%</td>
                    <td className="p-2 text-right text-xs">{r.cumulative}%</td>
                    <td className="p-2 text-right text-xs">{r.cadenceDays} 天</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.lastCountedAt ? formatDateTime(r.lastCountedAt) : "从未"}</td>
                    <td className={`p-2 text-xs ${overdue ? "text-rose-700 font-semibold" : ""}`}>
                      {r.nextDueAt.toLocaleDateString("zh-CN")}{overdue ? "（应盘）" : ""}
                    </td>
                  </tr>
                );
              })}
              {abc.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">近 90 天无领料流水，暂无分类依据</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>盘点单列表</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b bg-card/40"><tr className="text-left">
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
                      <Link href={`/admin/stock-counts/${c.countNo}`} className="text-sky-400 hover:underline">{c.countNo}</Link>
                    </td>
                    <td className="p-3"><div>{c.workshop.name}</div><div className="text-xs text-muted-foreground">{c.workshop.code}</div></td>
                    <td className="p-3"><Badge className={STATUS_COLOR[c.status]}>{STOCK_COUNT_STATUS_LABEL[c.status]}</Badge></td>
                    <td className="p-3 text-right">{c._count.lines}</td>
                    <td className="p-3 text-right text-emerald-300">{positive}</td>
                    <td className="p-3 text-right text-red-400">{negative}</td>
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
