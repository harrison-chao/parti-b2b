import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const cancelSchema = z.object({
  reason: z.string().min(1, "取消原因必填").max(500),
  force: z.boolean().optional(), // 已部分发货 / 工单已进打包后仍要取消剩余时必须显式确认
});

const CANCELLABLE = ["DRAFT", "PENDING", "MODIFYING", "CONFIRMED", "PARTIALLY_PAID", "PRODUCING", "READY", "PARTIALLY_SHIPPED"] as const;

/** POST /api/orders/[orderNo]/cancel —— 订单取消（P1-C）
 *  状态守卫矩阵：
 *  - DRAFT/PENDING/MODIFYING：直接取消，无联动
 *  - CONFIRMED/PARTIALLY_PAID/PRODUCING/READY：联动取消工单（未扣料态直接取消；PACKING/READY_TO_SHIP 需 force，库存已扣提示走盘点回补）
 *  - PARTIALLY_SHIPPED：需 force，已发部分不撤、剩余终止
 *  - SHIPPED/COMPLETED/CANCELLED/REJECTED：拒绝（SHIPPED 走结案）
 *  已收款不阻塞，返回 warning（核销保留、余额转预收，退款线下处理）；CREDIT 单释放信用占用。 */
export async function POST(req: NextRequest, { params }: { params: { orderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可取消订单", 403, 403);

  const parsed = cancelSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { reason, force } = parsed.data;

  const order = await prisma.salesOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: { workOrder: true, dealer: true },
  });
  if (!order) return fail("订单不存在", 404, 404);
  if (!(CANCELLABLE as readonly string[]).includes(order.orderStatus)) {
    return fail(`订单状态 ${order.orderStatus} 不可取消（已发完的订单走「结案归档」）`);
  }

  const warnings: string[] = [];
  const wo = order.workOrder;
  if (wo && ["PACKING", "READY_TO_SHIP"].includes(wo.status) && !force) {
    return fail("工单已进入打包/待发货（库存可能已扣减），确认取消剩余生产请带 force 重试；已扣库存如需回补请走盘点或手工调整", 409, 409);
  }
  if (order.orderStatus === "PARTIALLY_SHIPPED" && !force) {
    return fail("订单已部分发货：已发部分不撤、取消将终止剩余生产，确认请带 force 重试", 409, 409);
  }
  if (Number(order.paidAmount) > 0) {
    warnings.push(`本单已收款 ¥${Number(order.paidAmount).toFixed(2)}，取消后核销保留、客户余额转为预收，如需退款请线下处理`);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const cancelTag = `【取消】原因：${reason} · ${session.user.name} ${now.toLocaleString("zh-CN")}`;

      const updatedOrder = await tx.salesOrder.update({
        where: { orderNo: order.orderNo },
        data: {
          orderStatus: "CANCELLED",
          internalRemark: order.internalRemark ? `${order.internalRemark}\n${cancelTag}` : cancelTag,
          needsReview: false, // 悬单取消即了结
        },
      });

      if (wo && wo.status !== "SHIPPED" && wo.status !== "CANCELLED") {
        await tx.workOrder.update({ where: { id: wo.id }, data: { status: "CANCELLED", currentNote: cancelTag } });
        await tx.workOrderEvent.create({
          data: {
            workOrderId: wo.id,
            fromStatus: wo.status,
            toStatus: "CANCELLED",
            note: `订单取消：${reason}`,
            operatorUserId: session.user.id,
            operatorName: session.user.name,
          },
        });
      }

      // 信用释放（镜像审核通过时的占用；幂等由 CANCELLED 前置守卫保证）
      if (order.paymentStatus === "CREDIT") {
        const amount = Number(order.confirmedAmount ?? order.totalAmount);
        if (amount > 0) {
          await tx.dealer.update({
            where: { id: order.dealerId },
            data: {
              usedCredit: { decrement: Math.min(amount, Number(order.dealer.usedCredit)) },
              creditBalance: { increment: Math.min(amount, Number(order.dealer.usedCredit)) },
            },
          });
        }
      }

      await logAudit({
        action: "ORDER_CANCEL",
        entityType: "SalesOrder",
        entityId: order.id,
        targetDealerId: order.dealerId,
        summary: `取消订单 ${order.orderNo}：${reason}`,
        detail: {
          orderNo: order.orderNo,
          fromStatus: order.orderStatus,
          workOrderCancelled: !!wo && wo.status !== "SHIPPED",
          paidAmount: Number(order.paidAmount),
          warnings,
        },
        actor: session.user,
      }, tx);

      return { order: updatedOrder, warnings };
    }, { timeout: 120_000, maxWait: 120_000 });

    return ok(result);
  } catch (e: any) {
    return fail(e?.message ?? "取消失败");
  }
}
