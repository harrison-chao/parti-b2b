import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "CLOSED", "CANCELLED"]).optional(),
  remark: z.string().optional().nullable(),
  expectedDate: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: { poNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("无权", 403, 403);
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  // 已收货的不可整单取消（否则实收应付从对账中蒸发）；如需处理请按已收结算后另行建单
  if (d.status === "CANCELLED") {
    const received = await prisma.purchaseOrderLine.count({ where: { poNo: params.poNo, receivedQty: { gt: 0 } } });
    if (received > 0) return fail(`已有 ${received} 行收货记录，不能整单取消；请走已收结算或联系管理员冲销`);
  }
  const po = await prisma.purchaseOrder.update({
    where: { poNo: params.poNo },
    data: {
      ...(d.status ? { status: d.status } : {}),
      ...(d.remark !== undefined ? { remark: d.remark } : {}),
      ...(d.expectedDate !== undefined ? { expectedDate: d.expectedDate ? new Date(d.expectedDate) : null } : {}),
    },
  });
  return ok(po);
}
