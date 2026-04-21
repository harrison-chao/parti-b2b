import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { genWorkOrderNo } from "@/lib/utils";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("无权访问", 403, 403);
  const workOrders = await prisma.workOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: { workshop: true, order: { include: { dealer: true } } },
  });
  return ok({ workOrders });
}

const schema = z.object({
  orderNo: z.string().min(1),
  workshopId: z.string().min(1),
  committedDeliveryDate: z.string().optional().nullable(),
  qcRequired: z.boolean().optional(),
  note: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可派单", 403, 403);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { orderNo, workshopId, committedDeliveryDate, qcRequired, note } = parsed.data;

  const order = await prisma.salesOrder.findUnique({
    where: { orderNo },
    include: { lines: { select: { lineType: true } } },
  });
  if (!order) return fail("订单不存在", 404, 404);
  if (!["CONFIRMED", "PARTIALLY_PAID"].includes(order.orderStatus)) {
    return fail(`订单状态 ${order.orderStatus} 不可派单（需已确认或部分付款）`);
  }
  const producibleLines = order.lines.filter((l) => l.lineType !== "OUTSOURCED");
  if (producibleLines.length === 0) {
    return fail("此订单全部为外购行，无需派至车间。请直接走发货流程。");
  }
  const exists = await prisma.workOrder.findUnique({ where: { orderNo } });
  if (exists) return fail("该订单已派单");

  const workshop = await prisma.workshop.findUnique({ where: { id: workshopId } });
  if (!workshop || !workshop.isActive) return fail("车间不存在或已停用");

  const workOrderNo = genWorkOrderNo();

  const wo = await prisma.$transaction(async (tx) => {
    const created = await tx.workOrder.create({
      data: {
        workOrderNo,
        orderNo,
        workshopId,
        status: "SCHEDULED",
        committedDeliveryDate: committedDeliveryDate ? new Date(committedDeliveryDate) : order.targetDeliveryDate,
        qcRequired: qcRequired ?? true,
        currentNote: note ?? null,
        assignedBy: session.user.name,
      },
    });
    await tx.workOrderEvent.create({
      data: {
        workOrderId: created.id,
        fromStatus: null,
        toStatus: "SCHEDULED",
        note: note ?? `派发至 ${workshop.name}`,
        operatorUserId: session.user.id,
        operatorName: session.user.name,
      },
    });
    await tx.salesOrder.update({
      where: { orderNo },
      data: { orderStatus: "PRODUCING" },
    });
    return created;
  });

  return ok(wo);
}
