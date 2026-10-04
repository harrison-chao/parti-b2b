import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("无权操作", 403, 403);
  try {
    await prisma.orderCombo.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  } catch (e: any) {
    return fail(e?.message ?? "删除失败");
  }
}
