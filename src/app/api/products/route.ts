import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  sku: z.string().min(1),
  productName: z.string().min(1),
  series: z.string().min(1),
  category: z.enum(["PROFILE", "HARDWARE"]),
  lengthMm: z.number().positive().optional().nullable(),
  spec: z.string().optional().nullable(),
  retailPrice: z.number().nonnegative(),
  purchasePrice: z.number().nonnegative().optional().nullable(),
  unit: z.string().optional(),
  drawingRequired: z.boolean().optional(),
  isRawMaterial: z.boolean().optional(),
  yieldRate: z.number().positive().max(1).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category");
  const activeOnly = searchParams.get("activeOnly") === "1";
  const where: any = {};
  if (category) where.category = category;
  if (activeOnly) where.isActive = true;
  const products = await prisma.product.findMany({
    where,
    orderBy: [{ category: "asc" }, { series: "asc" }, { sku: "asc" }],
  });
  return ok(products);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可维护产品", 403, 403);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  const exists = await prisma.product.findUnique({ where: { sku: d.sku } });
  if (exists) return fail("SKU 已存在");
  const product = await prisma.product.create({
    data: {
      sku: d.sku,
      productName: d.productName,
      series: d.series,
      category: d.category,
      lengthMm: d.lengthMm ?? null,
      spec: d.spec ?? null,
      retailPrice: d.retailPrice,
      purchasePrice: d.purchasePrice ?? null,
      unit: d.unit ?? "根",
      drawingRequired: d.drawingRequired ?? false,
      isRawMaterial: d.isRawMaterial ?? false,
      yieldRate: d.yieldRate ?? 0.95,
      isActive: d.isActive ?? true,
    },
  });
  return ok(product);
}
