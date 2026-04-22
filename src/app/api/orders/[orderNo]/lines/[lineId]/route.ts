import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  includedInProfit: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { orderNo: string; lineId: string } },
) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可修改明细", 403, 403);

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);

  const line = await prisma.salesOrderLine.findUnique({ where: { id: params.lineId } });
  if (!line || line.orderNo !== params.orderNo) return fail("订单行不存在", 404, 404);

  const updated = await prisma.salesOrderLine.update({
    where: { id: params.lineId },
    data: parsed.data,
  });
  return ok(updated);
}
