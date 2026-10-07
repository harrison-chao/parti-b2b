import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils";

// 列表状态分组：待审核 / 生产中 / 待收货 / 已完成
const TAB_DEFS: Array<[string, string, string[]]> = [
  ["all", "全部", []],
  ["pending", "待审核", ["DRAFT", "PENDING", "MODIFYING"]],
  ["producing", "生产中", ["CONFIRMED", "PARTIALLY_PAID", "PRODUCING", "READY"]],
  ["shipping", "待收货", ["PARTIALLY_SHIPPED", "SHIPPED"]],
  ["done", "已完成", ["COMPLETED"]],
];
// 已出运/已终结的单不再计逾期
const NON_OVERDUE = ["PARTIALLY_SHIPPED", "SHIPPED", "COMPLETED", "CANCELLED", "REJECTED"];
const PAGE_SIZE = 20;

export default async function OrdersPage({ searchParams }: { searchParams: { tab?: string; q?: string; page?: string } }) {
  const session = await auth();
  const dealerId = session!.user.dealerId!;
  const tabKey = TAB_DEFS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "all";
  const statuses = TAB_DEFS.find(([k]) => k === tabKey)![2];
  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, parseInt(searchParams.page ?? "1") || 1);

  const where = {
    dealerId,
    ...(statuses.length ? { orderStatus: { in: statuses as any } } : {}),
    ...(q ? { OR: [{ orderNo: { contains: q, mode: "insensitive" as const } }, { receiverName: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [total, orders, statusCounts] = await Promise.all([
    prisma.salesOrder.count({ where }),
    prisma.salesOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { lines: { select: { lineNo: true } } },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.salesOrder.groupBy({ by: ["orderStatus"], where: { dealerId }, _count: true }),
  ]);
  const countOf = (keys: string[]) => statusCounts.filter((s) => keys.includes(s.orderStatus)).reduce((s, x) => s + x._count, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdueDays = (o: { targetDeliveryDate: Date; orderStatus: string }) =>
    !NON_OVERDUE.includes(o.orderStatus) && o.targetDeliveryDate < today
      ? Math.floor((today.getTime() - new Date(o.targetDeliveryDate).getTime()) / 86400000)
      : 0;
  const qs = (patch: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { tab: tabKey, q, page, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "tab" && v === "all") && !(k === "page" && Number(v) === 1)) sp.set(k, String(v));
    const s = sp.toString();
    return s ? `/dealer/orders?${s}` : "/dealer/orders";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">我的订单</h1>
        <form action="/dealer/orders" className="flex gap-2">
          <input type="hidden" name="tab" value={tabKey} />
          <Input placeholder="搜索订单号 / 收货人" defaultValue={q} name="q" className="w-64" />
          <Button type="submit" variant="outline">搜索</Button>
        </form>
        <Link href="/dealer/quote"><Button>+ 创建订单</Button></Link>
      </div>

      <div className="flex w-fit rounded-xl border border-input bg-card/60 p-1 text-sm">
        {TAB_DEFS.map(([key, label, keys]) => (
          <Link key={key} href={qs({ tab: key, page: 1 })}
            className={`rounded-lg px-4 py-1.5 font-medium transition-colors ${tabKey === key ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/30" : "text-muted-foreground hover:text-foreground"}`}>
            {label} {key === "all" ? total : countOf(keys)}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{q ? "没有匹配的订单" : "暂无订单"}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr className="text-left">
                  <th className="p-3">订单号</th>
                  <th className="p-3">下单时间</th>
                  <th className="p-3">交期</th>
                  <th className="p-3">行数</th>
                  <th className="p-3 text-right">金额</th>
                  <th className="p-3">状态</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const od = overdueDays(o);
                  const editable = o.orderStatus === "DRAFT" || o.orderStatus === "MODIFYING";
                  return (
                    <tr key={o.orderNo} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-mono">{o.orderNo}</td>
                      <td className="p-3">{formatDate(o.orderDate)}</td>
                      <td className="p-3">
                        {formatDate(o.targetDeliveryDate)}
                        {od > 0 && <span className="ml-1 text-red-400 font-medium">逾期 {od} 天</span>}
                      </td>
                      <td className="p-3">{o.lines.length}</td>
                      <td className="p-3 text-right font-medium">{formatMoney(Number(o.totalAmount))}</td>
                      <td className="p-3"><Badge className={ORDER_STATUS_COLOR[o.orderStatus]}>{ORDER_STATUS_LABEL[o.orderStatus]}</Badge></td>
                      <td className="p-3 space-x-2 whitespace-nowrap">
                        <Link href={`/dealer/orders/${o.orderNo}`} className="text-sky-400 hover:underline">查看</Link>
                        {editable ? (
                          <Link href={`/dealer/quote?from=${o.orderNo}&mode=edit`} className="text-amber-400 hover:underline">继续编辑</Link>
                        ) : o.orderStatus !== "CANCELLED" && o.orderStatus !== "REJECTED" ? (
                          <Link href={`/dealer/quote?from=${o.orderNo}`} className="text-emerald-400 hover:underline">再来一单</Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>第 {page} / {pages} 页 · 共 {total} 单</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={qs({ page: page - 1 })}><Button variant="outline" size="sm">上一页</Button></Link>}
            {page < pages && <Link href={qs({ page: page + 1 })}><Button variant="outline" size="sm">下一页</Button></Link>}
          </div>
        </div>
      )}
    </div>
  );
}
