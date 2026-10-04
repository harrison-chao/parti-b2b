import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { logAudit } from "@/lib/audit";

/** POST /api/orders/[orderNo]/complete —— SHIPPED → COMPLETED 结案归档（P1-C）
 *  结案 = 客户签收/验收完成。工单保持 SHIPPED 不动（salesOrderStatusFor 无 COMPLETED 映射，订单级终点动作）。 */
export async function POST(_req: NextRequest, { params }: { params: { orderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可结案", 403, 403);

  const order = await prisma.salesOrder.findUnique({ where: { orderNo: params.orderNo } });
  if (!order) return fail("订单不存在", 404, 404);
  if (order.orderStatus !== "SHIPPED") {
    return fail(`仅已发货订单可结案（当前 ${order.orderStatus}）`);
  }

  const updated = await prisma.salesOrder.update({
    where: { orderNo: order.orderNo },
    data: { orderStatus: "COMPLETED" },
  });

  await logAudit({
    action: "ORDER_COMPLETE",
    entityType: "SalesOrder",
    entityId: order.id,
    targetDealerId: order.dealerId,
    summary: `结案归档 ${order.orderNo}`,
    actor: session.user,
  });

  return ok(updated);
}
