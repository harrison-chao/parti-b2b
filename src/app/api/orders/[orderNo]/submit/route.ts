import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

export async function POST(_req: NextRequest, { params }: { params: { orderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "DEALER") return fail("仅经销商可提交", 403, 403);
  const order = await prisma.salesOrder.findUnique({ where: { orderNo: params.orderNo } });
  if (!order) return fail("订单不存在", 404, 404);
  if (order.dealerId !== session.user.dealerId) return fail("无权操作", 403, 403);
  if (order.orderStatus !== "DRAFT" && order.orderStatus !== "MODIFYING") {
    return fail(`当前状态 ${order.orderStatus} 无法提交`);
  }
  const updated = await prisma.salesOrder.update({
    where: { orderNo: params.orderNo },
    data: { orderStatus: "PENDING" },
  });
  return ok(updated);
}
