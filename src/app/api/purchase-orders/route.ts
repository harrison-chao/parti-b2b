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
  // 批次计价第 2 步：KG=按重量结算（磅单×元/kg），BAR/缺省=按根（元/根）
  pricingUnit: z.enum(["BAR", "KG"]).optional(),
  totalWeightKg: z.number().positive().optional().nullable(),
  settleUnitPrice: z.number().positive().optional().nullable(),
}).refine((l) => l.pricingUnit !== "KG" || (l.totalWeightKg != null && l.settleUnitPrice != null), {
  message: "按重量结算行需填 约重(kg) 与 结算单价(元/kg)",
});

const createSchema = z.object({
  supplierId: z.string().min(1),
  workshopId: z.string().min(1),
  expectedDate: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  receiverName: z.string().optional().nullable(),
  receiverPhone: z.string().optional().nullable(),
  receiverAddress: z.string().optional().nullable(),
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

  // KG 行金额 = 约重×结算单价（下单预估）；BAR 行 = 数量×单价。收货后应付按实收重算（对账侧）。
  const lineAmountOf = (l: z.infer<typeof lineSchema>) =>
    l.pricingUnit === "KG" && l.totalWeightKg != null && l.settleUnitPrice != null
      ? l.totalWeightKg * l.settleUnitPrice
      : l.unitPrice * l.quantity;
  const totalAmount = d.lines.reduce((s, l) => s + lineAmountOf(l), 0);
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
      receiverName: d.receiverName ?? null,
      receiverPhone: d.receiverPhone ?? null,
      receiverAddress: d.receiverAddress ?? null,
      createdBy: session.user.name,
      lines: {
        create: d.lines.map((l, i) => ({
          lineNo: i + 1,
          sku: l.sku,
          productName: l.productName,
          spec: l.spec ?? null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineAmount: lineAmountOf(l),
          pricingUnit: l.pricingUnit ?? "BAR",
          totalWeightKg: l.totalWeightKg ?? null,
          settleUnitPrice: l.settleUnitPrice ?? null,
        })),
      },
    },
  });

  return ok(po);
}
