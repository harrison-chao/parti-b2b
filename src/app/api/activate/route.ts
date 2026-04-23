import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";
import { hashActivationToken } from "@/lib/account-activation";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  token: z.string().min(20),
  password: z.string().min(10, "密码至少需要 10 位").max(128, "密码过长"),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);

  const tokenHash = hashActivationToken(parsed.data.token);
  const user = await prisma.user.findFirst({ where: { activationTokenHash: tokenHash } });
  if (!user) return fail("启用链接无效或已使用", 404, 404);
  if (!user.activationTokenExpiresAt || user.activationTokenExpiresAt < new Date()) return fail("启用链接已过期，请联系管理员重新生成", 410, 410);

  const updated = await prisma.user.update({
    where: { id: user.id },
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
    action: "USER_ACTIVATED",
    entityType: "User",
    entityId: updated.id,
    targetUserId: updated.id,
    summary: `账号通过启用链接完成设置：${updated.email}`,
    detail: { targetEmail: updated.email, targetName: updated.name, targetRole: updated.role },
  });

  return ok({ user: updated });
}
