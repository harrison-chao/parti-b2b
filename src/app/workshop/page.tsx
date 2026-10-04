import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { AdvanceButton } from "@/components/advance-button";
import { formatDate, WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR } from "@/lib/utils";

/**
 * W2a: 车间作业队列（mobile-first 卡片）。
 * 按交期分桶（逾期/今天/明天/本周/更晚），每卡聚合明细，≤2 点按流转：
 * 待开工→开工；加工中→完成加工（质检可选单）；外协中→回厂打包；打包→待发；待发→去发货登记。
 */
export default async function WorkshopHomePage() {
  const session = await auth();
  if (!session?.user.workshopId) redirect("/login");
  const workshop = await prisma.workshop.findUnique({ where: { id: session.user.workshopId } });
  const workOrders = await prisma.workOrder.findMany({
    where: { workshopId: session.user.workshopId, status: { not: "SHIPPED" } },
    orderBy: [{ committedDeliveryDate: "asc" }, { createdAt: "desc" }],
    include: {
      order: {
        select: {
          orderNo: true, displayOrderNo: true, receiverName: true, targetDeliveryDate: true,
          lines: { where: { lineType: { not: "OUTSOURCED" } }, select: { sku: true, productName: true, quantity: true } },
        },
      },
    },
  });
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const dayMs = 86400_000;

  function bucket(d: Date | null): { key: string; label: string; order: number } {
    if (!d) return { key: "none", label: "无交期", order: 9 };
    if (d < todayStart) return { key: "overdue", label: "⚠ 已逾期", order: 0 };
    const days = Math.floor((d.getTime() - todayStart.getTime()) / dayMs);
    if (days === 0) return { key: "today", label: "今天到期", order: 1 };
    if (days === 1) return { key: "tmr", label: "明天到期", order: 2 };
    if (days <= 7) return { key: "week", label: "本周到期", order: 3 };
    return { key: "later", label: "更晚", order: 4 };
  }

  const buckets = new Map<string, { label: string; order: number; items: typeof workOrders }>();
  for (const wo of workOrders) {
    const b = bucket(wo.committedDeliveryDate);
    if (!buckets.has(b.key)) buckets.set(b.key, { label: b.label, order: b.order, items: [] });
    buckets.get(b.key)!.items.push(wo);
  }
  const sortedBuckets = [...buckets.values()].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4 stagger-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">{workshop?.name} · 作业队列</h1>
          <p className="text-xs text-muted-foreground">{workOrders.length} 张在产 · 按交期排序</p>
        </div>
        <Link href="/workshop/cutlist" className="text-sm text-sky-400 hover:underline">截料清单 →</Link>
      </div>

      {sortedBuckets.map((b) => (
        <div key={b.label} className="space-y-2">
          <div className={`text-sm font-semibold ${b.order === 0 ? "text-red-400" : "text-muted-foreground"}`}>{b.label}（{b.items.length}）</div>
          {b.items.map((wo, idx) => {
            const overdue = wo.committedDeliveryDate && wo.committedDeliveryDate < now;
            const totalQty = wo.order.lines.reduce((s, l) => s + l.quantity, 0);
            // 聚合同 SKU 行
            const skuAgg = new Map<string, number>();
            for (const l of wo.order.lines) skuAgg.set(l.sku, (skuAgg.get(l.sku) ?? 0) + l.quantity);
            return (
              <div key={wo.id}
                className={`glass-card glass-card-hover relative overflow-hidden rounded-xl p-3 pl-4 ${overdue ? "ring-1 ring-inset ring-destructive/50" : ""}`}
                style={{ animation: `rise-in 0.45s cubic-bezier(0.22,1,0.36,1) ${Math.min(idx * 60, 480)}ms both` }}>
                <span className={`absolute inset-y-0 left-0 w-1 ${{
                  PENDING_START: "bg-slate-500", PROCESSING: "bg-indigo-400", OUTSOURCING: "bg-amber-400",
                  QC: "bg-fuchsia-400", PACKING: "bg-purple-400", READY_TO_SHIP: "bg-cyan-400", SHIPPED: "bg-emerald-400", CANCELLED: "bg-zinc-600",
                }[wo.status] ?? "bg-slate-500"}`} />
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="stat-num font-mono text-base font-bold">{wo.order.displayOrderNo ?? wo.workOrderNo}</span>
                      <Badge className={WORK_ORDER_STATUS_COLOR[wo.status]}>{WORK_ORDER_STATUS_LABEL[wo.status]}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {wo.order.receiverName} · 交期 {wo.committedDeliveryDate ? formatDate(wo.committedDeliveryDate) : "-"}
                      {overdue && <span className="text-destructive font-semibold"> · 超期</span>}
                    </div>
                    <div className="text-sm mt-1.5 space-x-2 flex-wrap">
                      {[...skuAgg.entries()].map(([sku, qty]) => (
                        <span key={sku} className="inline-block rounded bg-secondary/70 px-1.5 py-0.5 font-mono text-xs text-foreground/95">{sku} <span className="text-cyan-300 font-semibold">×{qty}</span></span>
                      ))}
                      <span className="text-xs text-muted-foreground">共{totalQty}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {wo.status === "PENDING_START" && <AdvanceButton workOrderNo={wo.workOrderNo} label="开工" className="h-11 w-24 text-sm" />}
                    {wo.status === "PROCESSING" && wo.qcRequired && <AdvanceButton workOrderNo={wo.workOrderNo} label="送质检" variant="outline" className="h-11 w-24 text-sm" />}
                    {wo.status === "PROCESSING" && !wo.qcRequired && <AdvanceButton workOrderNo={wo.workOrderNo} label="完成加工" className="h-11 w-24 text-sm" />}
                    {wo.status === "OUTSOURCING" && <AdvanceButton workOrderNo={wo.workOrderNo} label="外协回厂" className="h-11 w-24 text-sm" />}
                    {wo.status === "QC" && <AdvanceButton workOrderNo={wo.workOrderNo} label="质检完成" className="h-11 w-24 text-sm" />}
                    {wo.status === "PACKING" && <AdvanceButton workOrderNo={wo.workOrderNo} label="打包完成" className="h-11 w-24 text-sm" />}
                    {wo.status === "READY_TO_SHIP" && (
                      <Link href="/workshop/ship" className="flex h-11 w-24 items-center justify-center text-sm rounded-md bg-blue-600 text-white spring-press">去发货</Link>
                    )}
                    <Link href={`/workshop/orders/${wo.workOrderNo}`} className="flex h-8 items-center justify-center text-xs text-muted-foreground text-center">详情</Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {!workOrders.length && <div className="text-center text-muted-foreground p-8">目前没有进行中的加工单 🎉</div>}
    </div>
  );
}
