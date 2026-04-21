import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT", "MODIFY"]),
  remark: z.string().optional().nullable(),
  suggestedDeliveryDate: z.string().optional().nullable(),
  confirmedAmount: z.number().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { orderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") {
    return fail("仅管理员可审核", 403, 403);
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { action, remark, suggestedDeliveryDate, confirmedAmount } = parsed.data;

  const order = await prisma.salesOrder.findUnique({ where: { orderNo: params.orderNo } });
  if (!order) return fail("订单不存在", 404, 404);
  if (order.orderStatus !== "PENDING") return fail(`当前状态 ${order.orderStatus} 无法审核`);

  const newStatus = action === "APPROVE" ? "CONFIRMED" : action === "REJECT" ? "REJECTED" : "MODIFYING";

  try {
    const updated = await prisma.$transaction(async (tx) => {
    const dealer = await tx.dealer.findUnique({ where: { id: order.dealerId } });
    const creditAmount = confirmedAmount ?? Number(order.totalAmount);
    if (action === "APPROVE") {
      if (!dealer || dealer.status !== "ACTIVE") throw new Error("经销商不存在或已停用，不能审核通过");
      if (dealer.paymentMethod === "CREDIT" && !dealer.allowOverCredit && Number(dealer.creditBalance) < creditAmount) {
        throw new Error(`信用额度不足（可用 ${Number(dealer.creditBalance).toFixed(2)}，确认金额 ${creditAmount.toFixed(2)}）`);
      }
    }

    const u = await tx.salesOrder.update({
      where: { orderNo: params.orderNo },
      data: {
        orderStatus: newStatus,
        reviewer: session.user.name,
        reviewTime: new Date(),
        reviewRemark: remark ?? null,
        suggestedDeliveryDate: suggestedDeliveryDate ? new Date(suggestedDeliveryDate) : null,
        confirmedAmount: confirmedAmount ?? null,
        paymentStatus: action === "APPROVE" && dealer?.paymentMethod === "CREDIT" ? "CREDIT" : order.paymentStatus,
      },
    });

    if (action === "APPROVE" && dealer?.paymentMethod === "CREDIT") {
      await tx.dealer.update({
        where: { id: dealer.id },
        data: {
          usedCredit: { increment: creditAmount },
          creditBalance: { decrement: creditAmount },
        },
      });
    }
    return u;
    }, { timeout: 120_000, maxWait: 120_000 });

    return ok(updated);
  } catch (error: any) {
    return fail(error?.message ?? "审核失败");
  }
}
