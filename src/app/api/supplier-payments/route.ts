import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  supplierId: z.string().min(1),
  amount: z.number().positive(),
  paidAt: z.string().min(1),
  method: z.string().optional().nullable(),
  refNo: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可查看付款记录", 403, 403);
  const supplierId = req.nextUrl.searchParams.get("supplierId");
  const payments = await prisma.supplierPayment.findMany({
    where: supplierId ? { supplierId } : {},
    orderBy: { paidAt: "desc" },
  });
  return ok(payments);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可登记付款", 403, 403);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  const supplier = await prisma.supplier.findUnique({ where: { id: d.supplierId } });
  if (!supplier) return fail("供应商不存在", 404, 404);
  const p = await prisma.$transaction(async (tx) => {
    const created = await tx.supplierPayment.create({
      data: {
        supplierId: d.supplierId,
        amount: d.amount,
        paidAt: new Date(d.paidAt),
        method: d.method ?? null,
        refNo: d.refNo ?? null,
        note: d.note ?? null,
        recordedBy: session.user.name ?? null,
      },
    });

    let remaining = d.amount;
    const pos = await tx.purchaseOrder.findMany({
      where: { supplierId: d.supplierId, status: { not: "CANCELLED" } },
      include: { lines: true },
      orderBy: [{ orderDate: "asc" }, { createdAt: "asc" }],
    });
    for (const po of pos) {
      if (remaining <= 0) break;
      const payable = po.lines.reduce((sum, line) => sum + Number(line.unitPrice) * line.receivedQty, 0);
      const paid = Number(po.paidAmount);
      const due = Math.max(0, payable - paid);
      if (due <= 0) continue;
      const alloc = Math.min(due, remaining);
      await tx.supplierPaymentAllocation.create({
        data: { paymentId: created.id, poNo: po.poNo, amount: alloc },
      });
      await tx.purchaseOrder.update({
        where: { poNo: po.poNo },
        data: { paidAmount: { increment: alloc } },
      });
      remaining -= alloc;
    }

    return created;
  }, { timeout: 120_000, maxWait: 120_000 });
  return ok(p);
}
