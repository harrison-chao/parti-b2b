import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";
import { RECEIVABLE_ORDER_STATUSES } from "@/lib/reconcile";

const createSchema = z.object({
  dealerId: z.string().min(1),
  amount: z.number().positive(),
  paidAt: z.string().min(1),
  method: z.string().optional().nullable(),
  refNo: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可查看收款记录", 403, 403);
  const dealerId = req.nextUrl.searchParams.get("dealerId");
  const payments = await prisma.dealerPayment.findMany({
    where: dealerId ? { dealerId } : {},
    orderBy: { paidAt: "desc" },
  });
  return ok(payments);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可登记收款", 403, 403);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  const dealer = await prisma.dealer.findUnique({ where: { id: d.dealerId } });
  if (!dealer) return fail("经销商不存在", 404, 404);
  const p = await prisma.$transaction(async (tx) => {
    const created = await tx.dealerPayment.create({
      data: {
        dealerId: d.dealerId,
        amount: d.amount,
        paidAt: new Date(d.paidAt),
        method: d.method ?? null,
        refNo: d.refNo ?? null,
        note: d.note ?? null,
        recordedBy: session.user.name ?? null,
      },
    });

    if (dealer.paymentMethod === "CREDIT") {
      const release = Math.min(Number(dealer.usedCredit), d.amount);
      if (release > 0) {
        await tx.dealer.update({
          where: { id: dealer.id },
          data: {
            usedCredit: { decrement: release },
            creditBalance: { increment: release },
          },
        });
      }
    }

    let remaining = d.amount;
    const orders = await tx.salesOrder.findMany({
      where: {
        dealerId: d.dealerId,
        orderStatus: { in: RECEIVABLE_ORDER_STATUSES as any },
      },
      orderBy: [{ orderDate: "asc" }, { createdAt: "asc" }],
    });

    for (const order of orders) {
      if (remaining <= 0) break;
      const receivable = Number(order.confirmedAmount ?? order.totalAmount);
      const paid = Number(order.paidAmount);
      const due = Math.max(0, receivable - paid);
      if (due <= 0) continue;
      const alloc = Math.min(due, remaining);
      const newPaid = paid + alloc;
      await tx.dealerPaymentAllocation.create({
        data: { paymentId: created.id, orderNo: order.orderNo, amount: alloc },
      });
      await tx.salesOrder.update({
        where: { orderNo: order.orderNo },
        data: {
          paidAmount: { increment: alloc },
          paymentStatus: newPaid >= receivable ? "PAID" : "PARTIAL",
        },
      });
      remaining -= alloc;
    }

    return created;
  }, { timeout: 120_000, maxWait: 120_000 });
  return ok(p);
}
