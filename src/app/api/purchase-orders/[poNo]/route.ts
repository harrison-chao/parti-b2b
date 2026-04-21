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
