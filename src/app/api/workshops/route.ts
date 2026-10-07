import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireRole } from "@/lib/api";
import { z } from "zod";

export async function GET() {
  const guard = await requireRole("ADMIN");
  if (guard.response) return guard.response;
  const session = guard.session;
  const workshops = await prisma.workshop.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { workOrders: true, users: true } },
    },
  });
  return ok({ workshops });
}

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  contactName: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireRole("ADMIN");
  if (guard.response) return guard.response;
  const session = guard.session;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  const existing = await prisma.workshop.findUnique({ where: { code: d.code } });
  if (existing) return fail("车间编号已存在");
  const workshop = await prisma.workshop.create({
    data: {
      code: d.code,
      name: d.name,
      contactName: d.contactName ?? null,
      contactPhone: d.contactPhone ?? null,
      address: d.address ?? null,
      isActive: d.isActive ?? true,
    },
  });
  return ok(workshop);
}
