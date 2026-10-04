import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({
  productName: z.string().min(1).optional(),
  series: z.string().min(1).optional(),
  category: z.enum(["PROFILE", "HARDWARE"]).optional(),
  lengthMm: z.number().positive().optional().nullable(),
  spec: z.string().optional().nullable(),
  surfaceProcessCode: z.string().optional().nullable(),
  surfaceColorCode: z.string().optional().nullable(),
  weightPerMeter: z.number().positive().optional().nullable(),
  materialStage: z.enum(["RAW", "SEMI"]).optional().nullable(),
  retailPrice: z.number().nonnegative().optional(),
  purchasePrice: z.number().nonnegative().optional().nullable(),
  unit: z.string().optional(),
  drawingRequired: z.boolean().optional(),
  isRawMaterial: z.boolean().optional(),
  yieldRate: z.number().positive().max(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可维护产品", 403, 403);
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const existing = await prisma.product.findUnique({ where: { id: params.id } });
  if (!existing) return fail("产品不存在", 404, 404);
  const next = { ...parsed.data } as any;
  if (parsed.data.isRawMaterial && !parsed.data.materialStage && !existing.materialStage) {
    next.materialStage = "RAW";
  }
  const product = await prisma.product.update({ where: { id: params.id }, data: next });
  // 成本/价格相关字段变动留痕 old→new（评审 C9：改价无审计，毛利漂移无法追溯）
  const watched = ["retailPrice", "purchasePrice", "weightPerMeter", "yieldRate"] as const;
  const changes = watched
    .filter((k) => parsed.data[k] !== undefined && String(parsed.data[k]) !== String((existing as any)[k]))
    .map((k) => ({ field: k, from: (existing as any)[k], to: (parsed.data as any)[k] }));
  if (changes.length > 0) {
    await logAudit({
      action: "PRODUCT_PRICE_CHANGE",
      entityType: "Product",
      entityId: product.id,
      summary: `产品 ${product.sku} 价格/成本参数变更`,
      detail: { changes },
      actor: session.user,
    });
  }
  return ok(product);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可维护产品", 403, 403);

  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product) return fail("产品不存在", 404, 404);

  const [salesLines, purchaseLines, inventoryRows, movements] = await Promise.all([
    prisma.salesOrderLine.count({
      where: {
        OR: [
          { sku: product.sku },
          { productId: product.id },
          { rawProductId: product.id },
        ],
      },
    }),
    prisma.purchaseOrderLine.count({ where: { sku: product.sku } }),
    prisma.workshopInventory.count({ where: { sku: product.sku } }),
    prisma.stockMovement.count({ where: { sku: product.sku } }),
  ]);

  const references = salesLines + purchaseLines + inventoryRows + movements;
  if (references > 0) {
    return fail(`该 SKU 已有 ${references} 条业务引用，不能删除；请改为停用。`);
  }

  const deleted = await prisma.product.delete({ where: { id: params.id } });
  return ok(deleted);
}
