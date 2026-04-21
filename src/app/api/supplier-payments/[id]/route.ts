import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可删除付款记录", 403, 403);
  const exists = await prisma.supplierPayment.findUnique({
    where: { id: params.id },
    include: { allocations: true },
  });
  if (!exists) return fail("记录不存在", 404, 404);
  await prisma.$transaction(async (tx) => {
    for (const allocation of exists.allocations) {
      await tx.purchaseOrder.update({
        where: { poNo: allocation.poNo },
        data: { paidAmount: { decrement: allocation.amount } },
      });
    }
    await tx.supplierPayment.delete({ where: { id: params.id } });
  }, { timeout: 120_000, maxWait: 120_000 });
  return ok({ ok: true });
}
