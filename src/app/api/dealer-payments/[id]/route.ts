import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可删除收款记录", 403, 403);
  const exists = await prisma.dealerPayment.findUnique({
    where: { id: params.id },
    include: { dealer: true, allocations: { include: { order: true } } },
  });
  if (!exists) return fail("记录不存在", 404, 404);
  await prisma.$transaction(async (tx) => {
    for (const allocation of exists.allocations) {
      const currentPaid = Number(allocation.order.paidAmount);
      const newPaid = Math.max(0, currentPaid - Number(allocation.amount));
      const receivable = Number(allocation.order.confirmedAmount ?? allocation.order.totalAmount);
      await tx.salesOrder.update({
        where: { orderNo: allocation.orderNo },
        data: {
          paidAmount: newPaid,
          paymentStatus: newPaid <= 0
            ? (exists.dealer.paymentMethod === "CREDIT" ? "CREDIT" : "UNPAID")
            : newPaid >= receivable ? "PAID" : "PARTIAL",
        },
      });
    }

    await tx.dealerPayment.delete({ where: { id: params.id } });
    if (exists.dealer.paymentMethod === "CREDIT" && Number(exists.creditReleased) > 0) {
      await tx.dealer.update({
        where: { id: exists.dealerId },
        data: {
          usedCredit: { increment: exists.creditReleased },
          creditBalance: { decrement: exists.creditReleased },
        },
      });
    }
  }, { timeout: 120_000, maxWait: 120_000 });
  return ok({ ok: true });
}
