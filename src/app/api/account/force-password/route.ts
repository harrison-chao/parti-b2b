import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  password: z.string().min(10, "新密码至少需要 10 位").max(128, "密码过长"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      password: await bcrypt.hash(parsed.data.password, 10),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      activationTokenHash: null,
      activationTokenExpiresAt: null,
      activationTokenCreatedAt: null,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  await logAudit({
    action: "USER_FORCE_PASSWORD_CHANGED",
    entityType: "User",
    entityId: updated.id,
    targetUserId: updated.id,
    summary: `账号完成首次强制改密：${updated.email}`,
    detail: { targetEmail: updated.email, targetName: updated.name, targetRole: updated.role },
    actor: session.user,
  });

  return ok({ user: updated });
}
