import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

/** 使用计数（一键插入时 fire-and-forget 调用） */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("无权操作", 403, 403);
  await prisma.orderCombo.update({
    where: { id: params.id },
    data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
  });
  return ok({ used: true });
}
