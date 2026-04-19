import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role === "DEALER" && session.user.dealerId !== params.id) {
    return fail("无权访问", 403, 403);
  }
  const addresses = await prisma.dealerAddress.findMany({
    where: { dealerId: params.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return ok({ addresses });
}

const schema = z.object({
  receiverName: z.string().min(1),
  receiverPhone: z.string().min(1),
  province: z.string().min(1),
  city: z.string().min(1),
  district: z.string().min(1),
  detailAddress: z.string().min(1),
  isDefault: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role === "DEALER" && session.user.dealerId !== params.id) {
    return fail("无权操作", 403, 403);
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const addr = await prisma.dealerAddress.create({
    data: { ...parsed.data, dealerId: params.id },
  });
  return ok(addr);
}
