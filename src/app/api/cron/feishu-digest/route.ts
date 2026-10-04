import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { notifyFeishu } from "@/lib/feishu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * W2b + P1 升级：每日运营摘要（飞书群）。
 * 四段：① 已超期未发（@升级）② 5 天内到期 ③ 待审核>24h 订单 ④ 低库存 SKU。
 * Vercel cron 每天 09:10 北京时间触发。
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  const isCron = Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);
  if (!isCron && session?.user.role !== "ADMIN") return fail("无权", 403, 403);

  const now = new Date();
  const horizon = new Date(now.getTime() + 5 * 86400_000); // P1: 3天 → 5天预警窗口
  const dayAgo = new Date(now.getTime() - 86400_000);

  const [wos, pendingOrders, lowStockItems] = await Promise.all([
    prisma.workOrder.findMany({
      where: {
        status: { in: ["PENDING_START", "PROCESSING", "OUTSOURCING", "QC", "PACKING", "READY_TO_SHIP"] },
        committedDeliveryDate: { lte: horizon },
      },
      orderBy: { committedDeliveryDate: "asc" },
      take: 30,
      include: { order: { select: { displayOrderNo: true, receiverName: true, dealer: { select: { companyName: true, nickname: true } } } } },
    }),
    prisma.salesOrder.findMany({
      where: { orderStatus: "PENDING", createdAt: { lte: dayAgo } },
      orderBy: { createdAt: "asc" },
      take: 10,
      include: { dealer: { select: { companyName: true, nickname: true } } },
    }),
    prisma.workshopInventory.findMany({ where: { lowStockThreshold: { gt: 0 } }, take: 15 }),
  ]);
  const low = lowStockItems.filter((i) => i.quantity <= (i.lowStockThreshold ?? 0));

  const overdue = wos.filter((w) => w.committedDeliveryDate! < now);
  const soon = wos.filter((w) => w.committedDeliveryDate! >= now);
  const fmt = (d: Date | null) => (d ? `${d.getMonth() + 1}/${d.getDate()}` : "?");
  const line = (w: (typeof wos)[number]) =>
    `${w.order.displayOrderNo ?? w.workOrderNo} · ${(w.order.dealer.nickname || w.order.dealer.companyName).slice(0, 10)} · 交期${fmt(w.committedDeliveryDate)} · ${w.status}`;

  const sections: string[] = [];
  if (overdue.length) sections.push("⚠ 已超期：", ...overdue.slice(0, 12).map(line), ...(overdue.length > 12 ? [`…共 ${overdue.length} 单`] : []));
  if (soon.length) sections.push("⏰ 5天内到期：", ...soon.slice(0, 10).map(line), ...(soon.length > 10 ? [`…共 ${soon.length} 单`] : []));
  if (pendingOrders.length) {
    sections.push(`📝 待审核超 24h（${pendingOrders.length}）：`,
      ...pendingOrders.slice(0, 8).map((o) => `${o.displayOrderNo ?? o.orderNo} · ${(o.dealer.nickname || o.dealer.companyName).slice(0, 10)} · ¥${Number(o.totalAmount).toFixed(0)}`));
  }
  if (low.length) {
    sections.push("📦 低库存：", ...low.slice(0, 10).map((i) => `${i.sku} 现有 ${i.quantity} / 阈值 ${i.lowStockThreshold}`));
  }

  if (!sections.length) {
    if (isCron) return ok({ sent: false, reason: "all-clear" });
    return ok({ sent: false, overdue: [], soon: [] });
  }

  await notifyFeishu("车间运营日报", sections.slice(0, 40));

  return ok({
    sent: true,
    overdue: overdue.length,
    soon: soon.length,
    pendingOver24h: pendingOrders.length,
    lowStock: low.length,
  });
}
