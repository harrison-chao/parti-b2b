import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { notifyFeishu } from "@/lib/feishu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * W2b: 每日交期提醒（飞书群）。
 * Vercel cron 每天 09:10 北京时间触发；列出：已超期未发 + 未来 3 天到期未发。
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  const isCron = Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);
  if (!isCron && session?.user.role !== "ADMIN") return fail("无权", 403, 403);

  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * 86400_000);

  const wos = await prisma.workOrder.findMany({
    where: {
      status: { in: ["PENDING_START", "PROCESSING", "OUTSOURCING", "QC", "PACKING", "READY_TO_SHIP"] },
      committedDeliveryDate: { lte: horizon },
    },
    orderBy: { committedDeliveryDate: "asc" },
    take: 30,
    include: { order: { select: { displayOrderNo: true, receiverName: true, dealer: { select: { companyName: true, nickname: true } } } } },
  });

  if (!wos.length) {
    if (isCron) return ok({ sent: false, reason: "no-upcoming" });
    return ok({ sent: false, upcoming: [] });
  }

  const overdue = wos.filter((w) => w.committedDeliveryDate! < now);
  const soon = wos.filter((w) => w.committedDeliveryDate! >= now);
  const fmt = (d: Date | null) => (d ? `${d.getMonth() + 1}/${d.getDate()}` : "?");
  const line = (w: (typeof wos)[number]) =>
    `${w.order.displayOrderNo ?? w.workOrderNo} · ${(w.order.dealer.nickname || w.order.dealer.companyName).slice(0, 10)} · 交期${fmt(w.committedDeliveryDate)} · ${w.status}`;

  await notifyFeishu(
    "车间交期提醒",
    [
      ...(overdue.length ? ["⚠ 已超期：", ...overdue.map(line)] : []),
      ...(soon.length ? ["⏰ 3天内到期：", ...soon.map(line)] : []),
    ].slice(0, 35),
  );

  return ok({ sent: true, overdue: overdue.length, soon: soon.length });
}
