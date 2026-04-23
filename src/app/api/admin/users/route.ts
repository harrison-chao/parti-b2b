import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";
import { activationExpiresAt, buildActivationLink, createActivationToken } from "@/lib/account-activation";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  email: z.string().trim().email("邮箱格式不正确").max(120, "邮箱过长"),
  name: z.string().trim().min(1, "姓名不能为空").max(50, "姓名过长"),
  password: z.string().min(10, "初始密码至少需要 10 位").max(128, "密码过长"),
  role: z.enum(["ADMIN", "DEALER", "WORKSHOP"]),
  dealerId: z.string().optional().nullable(),
  workshopId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可创建账号", 403, 403);

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);

  const data = parsed.data;
  const email = data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail("该邮箱已存在");

  if (data.role === "DEALER") {
    if (!data.dealerId) return fail("经销商账号必须选择经销商档案");
    const dealer = await prisma.dealer.findUnique({ where: { id: data.dealerId } });
    if (!dealer) return fail("经销商档案不存在", 404, 404);
  }

  if (data.role === "WORKSHOP") {
    if (!data.workshopId) return fail("车间账号必须选择加工车间");
    const workshop = await prisma.workshop.findUnique({ where: { id: data.workshopId } });
    if (!workshop) return fail("加工车间不存在", 404, 404);
  }

  const activation = createActivationToken();
  const expiresAt = activationExpiresAt();
  const user = await prisma.user.create({
    data: {
      email,
      name: data.name,
      password: await bcrypt.hash(data.password, 10),
      role: data.role,
      dealerId: data.role === "DEALER" ? data.dealerId! : null,
      workshopId: data.role === "WORKSHOP" ? data.workshopId! : null,
      mustChangePassword: true,
      activationTokenHash: activation.tokenHash,
      activationTokenExpiresAt: expiresAt,
      activationTokenCreatedAt: new Date(),
    },
    include: {
      dealer: { select: { dealerNo: true, companyName: true } },
      workshop: { select: { code: true, name: true } },
    },
  });

  await logAudit({
    action: "USER_CREATE",
    entityType: "User",
    entityId: user.id,
    targetUserId: user.id,
    targetDealerId: user.dealerId,
    targetWorkshopId: user.workshopId,
    summary: `管理员创建账号：${user.email}`,
    detail: { targetEmail: user.email, targetName: user.name, targetRole: user.role, activationExpiresAt: expiresAt.toISOString() },
    actor: session.user,
  });

  return ok({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      dealer: user.dealer,
      workshop: user.workshop,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      mustChangePassword: user.mustChangePassword,
      activationTokenExpiresAt: user.activationTokenExpiresAt,
    },
    activationLink: buildActivationLink(activation.token),
  });
}
