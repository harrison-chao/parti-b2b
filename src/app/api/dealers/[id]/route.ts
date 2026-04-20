import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const patchSchema = z.object({
  companyName: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  priceLevel: z.enum(["A", "B", "C", "D", "E"]).optional(),
  creditLimit: z.number().nonnegative().optional(),
  paymentMethod: z.enum(["PREPAID", "DEPOSIT", "CREDIT"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可修改", 403, 403);
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  const updateData: any = { ...d };
  if (d.creditLimit !== undefined) {
    const existing = await prisma.dealer.findUnique({ where: { id: params.id } });
    if (!existing) return fail("经销商不存在", 404, 404);
    const used = Number(existing.creditLimit) - Number(existing.creditBalance);
    updateData.creditBalance = Math.max(0, d.creditLimit - used);
  }
  const dealer = await prisma.dealer.update({ where: { id: params.id }, data: updateData });
  return ok(dealer);
}
