import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const patchSchema = z.object({
  productName: z.string().min(1).optional(),
  series: z.string().min(1).optional(),
  category: z.enum(["PROFILE", "HARDWARE"]).optional(),
  lengthMm: z.number().positive().optional().nullable(),
  spec: z.string().optional().nullable(),
  retailPrice: z.number().nonnegative().optional(),
  purchasePrice: z.number().nonnegative().optional().nullable(),
  unit: z.string().optional(),
  drawingRequired: z.boolean().optional(),
  isRawMaterial: z.boolean().optional(),
  yieldRate: z.number().positive().max(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可维护产品", 403, 403);
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const product = await prisma.product.update({
    where: { id: params.id },
    data: parsed.data as any,
  });
  return ok(product);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可维护产品", 403, 403);
  // soft delete only
  const product = await prisma.product.update({
    where: { id: params.id },
    data: { isActive: false },
  });
  return ok(product);
}
