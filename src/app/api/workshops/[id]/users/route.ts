import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("无权访问", 403, 403);
  const users = await prisma.user.findMany({
    where: { workshopId: params.id },
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return ok({ users });
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可创建", 403, 403);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const workshop = await prisma.workshop.findUnique({ where: { id: params.id } });
  if (!workshop) return fail("车间不存在", 404, 404);
  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return fail("邮箱已被使用");
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      password: await bcrypt.hash(parsed.data.password, 10),
      role: "WORKSHOP",
      workshopId: params.id,
    },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  return ok(user);
}
