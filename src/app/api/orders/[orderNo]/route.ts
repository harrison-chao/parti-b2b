import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: { orderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const order = await prisma.salesOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: { lines: { orderBy: { lineNo: "asc" } }, dealer: true },
  });
  if (!order) return fail("订单不存在", 404, 404);
  if (session.user.role === "DEALER" && order.dealerId !== session.user.dealerId) {
    return fail("无权访问", 403, 403);
  }
  return ok(order);
}
