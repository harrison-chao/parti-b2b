import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { getValuation, getPeriodSummary, getAging } from "@/lib/inventory-analytics";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
}

function monthRange(month: string): { from: Date; to: Date; label: string } {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  return { from, to, label: `${y} 年 ${m} 月` };
}
function recentMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default async function AdminInventoryPage({ searchParams }: { searchParams: { month?: string } }) {
  await requireAdmin();
  const month = searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : recentMonths(1)[0];
  const { from, to, label } = monthRange(month);

  const [items, valuation, period, aging] = await Promise.all([
    prisma.workshopInventory.findMany({
      orderBy: [{ workshop: { name: "asc" } }, { sku: "asc" }],
      include: { workshop: { select: { code: true, name: true } } },
    }),
    getValuation(prisma),
    getPeriodSummary(prisma, from, to),
    getAging(prisma, 90),
  ]);
  const lowStock = items.filter((item) => item.lowStockThreshold > 0 && item.quantity <= item.lowStockThreshold);
  const negative = items.filter((item) => item.quantity < 0);
  const noThreshold = items.filter((item) => item.lowStockThreshold === 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">库存管理</h1>
        <p className="text-sm text-muted-foreground">
          预警 / 估值 / 收发存 / 呆滞 四视图。估值按每米移动均价×米数（五金按档案采购价）；收发存按自然月聚合全部流水。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="库存 SKU" value={items.length} />
        <Stat title="库存总金额" value={valuation.total} tone="text-emerald-300" money />
        <Stat title="低库存 / 负库存" value={lowStock.length + negative.length} tone={negative.length ? "text-rose-700" : "text-amber-300"} />
        <Stat title="呆滞（≥90 天未动）" value={aging.length} tone="text-amber-300" />
      </div>
      {noThreshold.length > 0 && (
        <p className="text-xs text-muted-foreground">另有 {noThreshold.length} 个 SKU 未设预警阈值（车间库存页可维护）。</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>库存估值（{formatMoney(valuation.total)}）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {valuation.byWorkshop.map((w) => (
              <Badge key={w.workshopName} className="bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/20">
                {w.workshopName} {formatMoney(w.amount)}
              </Badge>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b bg-muted/50"><tr className="text-left">
                <th className="p-2">仓 / 车间</th><th className="p-2">SKU</th><th className="p-2">名称</th>
                <th className="p-2 text-right">数量</th><th className="p-2 text-right">米/件</th>
                <th className="p-2 text-right">每米均价</th><th className="p-2 text-right">单件价值</th>
                <th className="p-2 text-right">金额</th>
              </tr></thead>
              <tbody>
                {valuation.rows.slice(0, 100).map((r, i) => (
                  <tr key={`${r.workshopName}-${r.sku}-${i}`} className="border-b">
                    <td className="p-2 text-xs">{r.workshopName}</td>
                    <td className="p-2 font-mono text-xs">{r.sku}</td>
                    <td className="p-2 text-xs">{r.productName}</td>
                    <td className="p-2 text-right">{r.quantity}</td>
                    <td className="p-2 text-right text-xs">{r.metersPerUnit != null ? r.metersPerUnit.toFixed(1) : "-"}</td>
                    <td className="p-2 text-right text-xs">{r.avgCostPerMeter != null ? formatMoney(r.avgCostPerMeter) : (r.unitCostFallback != null ? `${formatMoney(r.unitCostFallback)}(档)` : "-")}</td>
                    <td className="p-2 text-right text-xs">{formatMoney(r.unitValue)}</td>
                    <td className="p-2 text-right font-medium">{formatMoney(r.amount)}</td>
                  </tr>
                ))}
                {valuation.rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">暂无有量库存</td></tr>}
                {valuation.rows.length > 100 && (
                  <tr><td colSpan={8} className="p-2 text-center text-xs text-muted-foreground">仅显示前 100 行（共 {valuation.rows.length} 行），总额已含全部</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>收发存汇总 · {label}</CardTitle>
            <div className="flex gap-1">
              {recentMonths(4).map((m) => (
                <a key={m} href={`/admin/inventory?month=${m}`}
                  className={`rounded border px-2 py-1 text-xs ${m === month ? "border-sky-500 bg-sky-500/10 text-sky-300" : "hover:bg-secondary"}`}>
                  {m}
                </a>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b bg-muted/50"><tr className="text-left">
              <th className="p-2">SKU</th><th className="p-2">名称</th>
              <th className="p-2 text-right">期初</th>
              <th className="p-2 text-right">收: 采购</th><th className="p-2 text-right">回库</th><th className="p-2 text-right">调拨入</th><th className="p-2 text-right">盘/调</th>
              <th className="p-2 text-right">发: 领料</th><th className="p-2 text-right">调拨出</th><th className="p-2 text-right">盘/调</th>
              <th className="p-2 text-right">期末</th>
            </tr></thead>
            <tbody>
              {period.slice(0, 60).map((r) => (
                <tr key={r.sku} className="border-b">
                  <td className="p-2 font-mono text-xs">{r.sku}</td>
                  <td className="p-2 text-xs">{r.productName}</td>
                  <td className="p-2 text-right">{r.opening}</td>
                  <td className="p-2 text-right text-xs text-emerald-300">{r.receivedPo || "-"}</td>
                  <td className="p-2 text-right text-xs text-emerald-300">{r.receivedReturn || "-"}</td>
                  <td className="p-2 text-right text-xs text-emerald-300">{r.receivedTransfer || "-"}</td>
                  <td className="p-2 text-right text-xs">{r.receivedAdjust || "-"}</td>
                  <td className="p-2 text-right text-xs text-rose-300">{r.issuedConsume || "-"}</td>
                  <td className="p-2 text-right text-xs text-rose-300">{r.issuedTransfer || "-"}</td>
                  <td className="p-2 text-right text-xs">{r.issuedAdjust || "-"}</td>
                  <td className="p-2 text-right font-medium">{r.closing}</td>
                </tr>
              ))}
              {period.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">该月无收发</td></tr>}
            </tbody>
          </table>
          {period.length > 60 && <p className="p-2 text-center text-xs text-muted-foreground">仅显示期末量前 60 行（共 {period.length} 行）</p>}
        </CardContent>
      </Card>

      <Card className={aging.length > 0 ? "border-amber-200" : ""}>
        <CardHeader><CardTitle>呆滞清单（≥90 天无流水且现存 &gt; 0）</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/50"><tr className="text-left">
              <th className="p-2">仓 / 车间</th><th className="p-2">SKU</th><th className="p-2">名称</th>
              <th className="p-2 text-right">现存</th><th className="p-2 text-right">闲置天数</th><th className="p-2">最后动账</th>
            </tr></thead>
            <tbody>
              {aging.map((r, i) => (
                <tr key={`${r.sku}-${i}`} className="border-b">
                  <td className="p-2 text-xs">{r.workshopName}</td>
                  <td className="p-2 font-mono text-xs">{r.sku}</td>
                  <td className="p-2 text-xs">{r.productName}</td>
                  <td className="p-2 text-right font-medium">{r.quantity}</td>
                  <td className="p-2 text-right text-amber-300">{r.idleDays} 天</td>
                  <td className="p-2 text-xs text-muted-foreground">{formatDateTime(r.lastMovedAt)}</td>
                </tr>
              ))}
              {aging.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">没有 ≥90 天未动的库存。</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>低库存 / 负库存明细</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b bg-muted/50">
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
                  <td className={`p-3 text-right font-semibold ${item.quantity < 0 ? "text-rose-700" : "text-amber-300"}`}>{item.quantity}</td>
                  <td className="p-3 text-right">{item.lowStockThreshold || "-"}</td>
                  <td className="p-3">
                    {item.quantity < 0 ? <Badge className="bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/20">负库存</Badge> : <Badge className="bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/20">低库存</Badge>}
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

function Stat({ title, value, tone = "text-slate-950", money = false }: { title: string; value: number; tone?: string; money?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={`mt-2 text-3xl font-black ${tone}`}>{money ? formatMoney(value) : value}</div>
      </CardContent>
    </Card>
  );
}
