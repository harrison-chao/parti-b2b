import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";
import { RECEIVABLE_ORDER_STATUSES } from "@/lib/reconcile";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  dealerId: z.string().min(1),
  amount: z.number().positive(),
  paidAt: z.string().min(1),
  method: z.string().optional().nullable(),
  refNo: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  // P1-E: 指定核销（可选）——先核销指定订单，剩余金额再走 FIFO
  allocations: z.array(z.object({ orderNo: z.string().min(1), amount: z.number().positive() })).optional(),
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
    const creditReleased = dealer.paymentMethod === "CREDIT" ? Math.min(Number(dealer.usedCredit), d.amount) : 0;
    const created = await tx.dealerPayment.create({
      data: {
        dealerId: d.dealerId,
        amount: d.amount,
        creditReleased,
        paidAt: new Date(d.paidAt),
        method: d.method ?? null,
        refNo: d.refNo ?? null,
        note: d.note ?? null,
        recordedBy: session.user.name ?? null,
      },
    });

    if (creditReleased > 0) {
      await tx.dealer.update({
        where: { id: dealer.id },
        data: {
          usedCredit: { decrement: creditReleased },
          creditBalance: { increment: creditReleased },
        },
      });
    }

    let remaining = d.amount;

    // 核销到单的共享逻辑（指定核销与 FIFO 复用）
    const allocateToOrder = async (order: { orderNo: string; confirmedAmount: Prisma.Decimal | null; totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }, alloc: number) => {
      const receivable = Number(order.confirmedAmount ?? order.totalAmount);
      const paid = Number(order.paidAmount);
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
    };

    // P1-E: 指定核销段（优先，超额/跨客户直接报错回滚）
    if (d.allocations?.length) {
      const specifiedTotal = d.allocations.reduce((s, a) => s + a.amount, 0);
      if (specifiedTotal > d.amount + 1e-9) {
        throw new Error(`指定核销合计 ¥${specifiedTotal.toFixed(2)} 超过收款金额 ¥${d.amount.toFixed(2)}`);
      }
      for (const a of d.allocations) {
        const order = await tx.salesOrder.findUnique({ where: { orderNo: a.orderNo } });
        if (!order) throw new Error(`指定核销订单不存在：${a.orderNo}`);
        if (order.dealerId !== d.dealerId) throw new Error(`订单 ${a.orderNo} 不属于该客户`);
        if (!(RECEIVABLE_ORDER_STATUSES as readonly string[]).includes(order.orderStatus)) {
          throw new Error(`订单 ${a.orderNo} 状态 ${order.orderStatus} 不可核销`);
        }
        const receivable = Number(order.confirmedAmount ?? order.totalAmount);
        const due = Math.max(0, receivable - Number(order.paidAmount));
        if (a.amount > due + 1e-9) {
          throw new Error(`订单 ${a.orderNo} 应收余额 ¥${due.toFixed(2)}，指定核销 ¥${a.amount.toFixed(2)} 超额`);
        }
        await allocateToOrder(order, a.amount);
        remaining -= a.amount;
      }
    }

    // FIFO 段（剩余金额按时间顺序核销；指定过的订单 due 已为 0 自然跳过）
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
      await allocateToOrder(order, alloc);
      remaining -= alloc;
    }

    // P0(C5)：收款登记必须留痕（金额是敏感操作）
    await logAudit({
      action: "DEALER_PAYMENT_CREATE",
      entityType: "DealerPayment",
      entityId: created.id,
      targetDealerId: dealer.id,
      summary: `登记收款 ¥${d.amount.toFixed(2)}：${dealer.companyName}（${d.method ?? "未注明方式"}）`,
      detail: {
        dealerNo: dealer.dealerNo, amount: d.amount, method: d.method ?? null, refNo: d.refNo ?? null, paidAt: d.paidAt,
        specifiedAllocations: d.allocations ?? null,
      },
      actor: session.user,
    }, tx);

    return created;
  }, { timeout: 120_000, maxWait: 120_000 });
  return ok(p);
}
