import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const resetSchema = z.object({
  password: z.string().min(10, "新密码至少需要 10 位").max(128, "新密码过长"),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可重置账号密码", 403, 403);
  if (params.id === session.user.id) return fail("不能在这里重置自己的密码，请使用账号设置");

  const parsed = resetSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return fail("账号不存在", 404, 404);

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { password: await bcrypt.hash(parsed.data.password, 10) },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      updatedAt: true,
    },
  });

  await logAudit({
    action: "USER_PASSWORD_RESET",
    entityType: "User",
    entityId: updated.id,
    targetUserId: updated.id,
    summary: `管理员重置账号密码：${updated.email}`,
    detail: { targetEmail: updated.email, targetName: updated.name, targetRole: updated.role },
    actor: session.user,
  });

  return ok({ user: updated });
}
