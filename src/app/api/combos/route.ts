import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { comboSignature, type ComboLine } from "@/lib/combo";
import { z } from "zod";

const lineSchema = z.object({
  lineType: z.enum(["PROFILE", "HARDWARE"]),
  rawProductId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  sku: z.string(),
  productName: z.string(),
  cutLengthMm: z.number().int().positive().optional().nullable(),
  processCodes: z.array(z.string()).default([]),
  surfaceProcessCode: z.string().optional().nullable(),
  surfaceColorCode: z.string().optional().nullable(),
  quantity: z.number().int().positive(),
});

const createSchema = z.object({
  name: z.string().min(1).optional(),
  lines: z.array(lineSchema).min(1),
});

export async function GET() {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("无权访问", 403, 403);
  const combos = await prisma.orderCombo.findMany({
    orderBy: [{ lastUsedAt: "desc" }, { usageCount: "desc" }, { createdAt: "desc" }],
    take: 60,
  });
  return ok({ combos });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("无权操作", 403, 403);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;
  const signature = comboSignature(data.lines as ComboLine[]);
  const first = data.lines[0];
  const name = data.name?.trim() || `${first.sku}${first.cutLengthMm ? " " + first.cutLengthMm + "mm" : ""} 等${data.lines.length}行`;
  const combo = await prisma.orderCombo.upsert({
    where: { signature },
    create: { name, lines: data.lines as any, signature, source: "manual", createdByUserId: session.user.id },
    update: { name, lines: data.lines as any, source: "manual", createdByUserId: session.user.id },
  });
  return ok(combo);
}
