import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { genPoNo } from "@/lib/utils";
import { z } from "zod";

const lineSchema = z.object({
  sku: z.string().min(1),
  productName: z.string().min(1),
  spec: z.string().optional().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const createSchema = z.object({
  supplierId: z.string().min(1),
  workshopId: z.string().min(1),
  expectedDate: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export async function GET() {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("无权", 403, 403);
  const pos = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { supplierNo: true, name: true } },
      workshop: { select: { code: true, name: true } },
      _count: { select: { lines: true } },
    },
  });
  return ok(pos);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可创建采购单", 403, 403);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;

  const supplier = await prisma.supplier.findUnique({ where: { id: d.supplierId } });
  if (!supplier || !supplier.isActive) return fail("供应商不存在或已停用");
  const workshop = await prisma.workshop.findUnique({ where: { id: d.workshopId } });
  if (!workshop || !workshop.isActive) return fail("车间不存在或已停用");

  const totalAmount = d.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const poNo = genPoNo();

  const po = await prisma.purchaseOrder.create({
    data: {
      poNo,
      supplierId: d.supplierId,
      workshopId: d.workshopId,
      status: "DRAFT",
      expectedDate: d.expectedDate ? new Date(d.expectedDate) : null,
      totalAmount,
      remark: d.remark ?? null,
      createdBy: session.user.name,
      lines: {
        create: d.lines.map((l, i) => ({
          lineNo: i + 1,
          sku: l.sku,
          productName: l.productName,
          spec: l.spec ?? null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineAmount: l.unitPrice * l.quantity,
        })),
      },
    },
  });

  return ok(po);
}
