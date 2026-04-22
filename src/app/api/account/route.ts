import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";

const updateSchema = z.object({
  name: z.string().trim().min(1, "姓名不能为空").max(50, "姓名过长"),
  email: z.string().trim().email("邮箱格式不正确").max(120, "邮箱过长"),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
});

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);

  const name = parsed.data.name;
  const email = parsed.data.email.toLowerCase();
  const currentPassword = parsed.data.currentPassword ?? "";
  const newPassword = parsed.data.newPassword?.trim() ?? "";

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return fail("账号不存在", 404, 404);

  const changingEmail = email !== user.email.toLowerCase();
  const changingPassword = newPassword.length > 0;

  if (changingPassword && newPassword.length < 10) {
    return fail("新密码至少需要 10 位");
  }

  if ((changingEmail || changingPassword) && !currentPassword) {
    return fail("修改邮箱或密码需要输入当前密码");
  }

  if (currentPassword) {
    const passwordOk = await bcrypt.compare(currentPassword, user.password);
    if (!passwordOk) return fail("当前密码不正确", 403, 403);
  }

  if (changingEmail) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== user.id) return fail("该邮箱已被其他账号使用");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      email,
      ...(changingPassword ? { password: await bcrypt.hash(newPassword, 10) } : {}),
    },
    select: { id: true, email: true, name: true, role: true },
  });

  return ok({ user: updated, shouldRelogin: changingEmail || changingPassword });
}
