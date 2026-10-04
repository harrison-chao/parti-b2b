import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  sku: z.string().min(1),
  // 型材简化（MR2525 即名称即规格）：productName 可省略，缺省 = 系列/型号名
  productName: z.string().optional(),
  series: z.string().min(1),
  category: z.enum(["PROFILE", "HARDWARE"]),
  lengthMm: z.number().positive().optional().nullable(),
  spec: z.string().optional().nullable(),
  surfaceProcessCode: z.string().optional().nullable(),
  surfaceColorCode: z.string().optional().nullable(),
  // 批次计价第 0 步：截面米重（kg/m，型材物理常数）；原料阶段 RAW=定尺长管 / SEMI=半成品段
  weightPerMeter: z.number().positive().optional().nullable(),
  materialStage: z.enum(["RAW", "SEMI"]).optional().nullable(),
  retailPrice: z.number().nonnegative(),
  purchasePrice: z.number().nonnegative().optional().nullable(),
  unit: z.string().optional(),
  drawingRequired: z.boolean().optional(),
  isRawMaterial: z.boolean().optional(),
  yieldRate: z.number().positive().max(1).optional(),
  isActive: z.boolean().optional(),
});

const bulkCreateSchema = z.object({
  products: z.array(createSchema).min(1, "至少需要一行产品").max(200, "单次最多导入 200 行"),
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
  // 采购成本价仅管理员可见（经销商门户/车间拿不到成本）
  if (session.user.role !== "ADMIN") {
    return ok(products.map(({ purchasePrice, ...rest }) => ({ ...rest, purchasePrice: null })));
  }
  return ok(products);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可维护产品", 403, 403);
  const body = await req.json();
  // 原料棒长必填：缺棒长会让扣料/缺料/需求按 3600 魔法默认折算，全线偏低
  const requireBarLength = (row: { isRawMaterial?: boolean; lengthMm?: number | null; sku?: string }) => {
    if (row.isRawMaterial && !row.lengthMm) return fail(`原料 ${row.sku ?? ""} 缺原料棒长（mm），必填`);
    return null;
  };
  if (Array.isArray(body.products)) {
    const parsed = bulkCreateSchema.safeParse(body);
    if (!parsed.success) return fail("参数错误: " + parsed.error.message);
    const rows = parsed.data.products.map((row) => ({ ...row, sku: row.sku.trim() }));
    const seen = new Set<string>();
    const duplicateInRequest = rows.find((row) => {
      if (seen.has(row.sku)) return true;
      seen.add(row.sku);
      return false;
    });
    if (duplicateInRequest) return fail(`导入数据中 SKU 重复：${duplicateInRequest.sku}`);

    const existing = await prisma.product.findMany({
      where: { sku: { in: rows.map((row) => row.sku) } },
      select: { sku: true },
    });
    if (existing.length > 0) return fail(`SKU 已存在：${existing.map((row) => row.sku).join(", ")}`);
    const badLength = rows.map(requireBarLength).find(Boolean);
    if (badLength) return badLength;

    const products = await prisma.$transaction(
      rows.map((row) => prisma.product.create({
        data: {
          sku: row.sku,
          productName: row.productName || row.series,
          series: row.series,
          category: row.category,
          lengthMm: row.lengthMm ?? null,
          spec: row.spec ?? null,
          surfaceProcessCode: row.surfaceProcessCode ?? null,
          surfaceColorCode: row.surfaceColorCode ?? null,
          weightPerMeter: row.weightPerMeter ?? null,
          materialStage: row.isRawMaterial ? row.materialStage ?? "RAW" : null,
          retailPrice: row.retailPrice,
          purchasePrice: row.purchasePrice ?? null,
          unit: row.unit ?? "根",
          drawingRequired: row.drawingRequired ?? false,
          isRawMaterial: row.isRawMaterial ?? false,
          yieldRate: row.yieldRate ?? 0.95,
          isActive: row.isActive ?? true,
        },
      })),
    );
    return ok({ count: products.length, products });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  const badLength = requireBarLength(d);
  if (badLength) return badLength;
  const exists = await prisma.product.findUnique({ where: { sku: d.sku } });
  if (exists) return fail("SKU 已存在");
  const product = await prisma.product.create({
    data: {
      sku: d.sku,
      productName: d.productName || d.series,
      series: d.series,
      category: d.category,
      lengthMm: d.lengthMm ?? null,
      spec: d.spec ?? null,
      surfaceProcessCode: d.surfaceProcessCode ?? null,
      surfaceColorCode: d.surfaceColorCode ?? null,
      weightPerMeter: d.weightPerMeter ?? null,
      materialStage: d.isRawMaterial ? d.materialStage ?? "RAW" : null,
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
