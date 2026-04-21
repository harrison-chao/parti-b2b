import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  committedDeliveryDate: z.string().optional().nullable(),
  qcRequired: z.boolean().optional(),
  currentNote: z.string().optional().nullable(),
  carrier: z.string().optional().nullable(),
  trackingNo: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: { workOrderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "WORKSHOP") return fail("无权操作", 403, 403);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;

  const wo = await prisma.workOrder.findUnique({ where: { workOrderNo: params.workOrderNo } });
  if (!wo) return fail("加工单不存在", 404, 404);
  if (role === "WORKSHOP" && wo.workshopId !== session.user.workshopId) return fail("非本车间订单", 403, 403);

  const data: any = {};
  if (d.committedDeliveryDate !== undefined) data.committedDeliveryDate = d.committedDeliveryDate ? new Date(d.committedDeliveryDate) : null;
  if (d.qcRequired !== undefined && role === "ADMIN") data.qcRequired = d.qcRequired;
  if (d.currentNote !== undefined) data.currentNote = d.currentNote;
  if (d.carrier !== undefined) data.carrier = d.carrier;
  if (d.trackingNo !== undefined) data.trackingNo = d.trackingNo;

  const updated = await prisma.workOrder.update({ where: { id: wo.id }, data });
  return ok(updated);
}
