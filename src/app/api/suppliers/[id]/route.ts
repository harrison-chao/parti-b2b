import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(["RAW_MATERIAL", "HARDWARE", "OUTSOURCED", "LOGISTICS", "SERVICE", "OTHER"]).optional(),
  contactName: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  taxNo: z.string().optional().nullable(),
  invoiceType: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  paymentDays: z.number().int().nonnegative().optional(),
  defaultLeadTimeDays: z.number().int().nonnegative().optional(),
  serviceScope: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  contacts: z.array(z.object({
    role: z.string().default("业务联系人"),
    name: z.string().min(1),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    wechat: z.string().optional().nullable(),
    isPrimary: z.boolean().optional(),
    remark: z.string().optional().nullable(),
  })).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("无权", 403, 403);
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { contacts, ...supplierPatch } = parsed.data;
  const s = await prisma.$transaction(async (tx) => {
    const updated = await tx.supplier.update({ where: { id: params.id }, data: supplierPatch });
    if (contacts) {
      await tx.supplierContact.deleteMany({ where: { supplierId: params.id } });
      if (contacts.length > 0) {
        await tx.supplierContact.createMany({
          data: contacts.map((c, idx) => ({
            supplierId: params.id,
            role: c.role,
            name: c.name,
            phone: c.phone ?? null,
            email: c.email ?? null,
            wechat: c.wechat ?? null,
            isPrimary: c.isPrimary ?? idx === 0,
            remark: c.remark ?? null,
          })),
        });
      }
    }
    return updated;
  });
  return ok(s);
}

// 管理员删除供应商：有采购单/付款记录则拒绝（保历史），无引用才物理删除（联系人级联）
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可删除供应商", 403, 403);
  const s = await prisma.supplier.findUnique({
    where: { id: params.id },
    include: { _count: { select: { purchaseOrders: true, payments: true } } },
  });
  if (!s) return fail("供应商不存在", 404, 404);
  if (s._count.purchaseOrders > 0 || s._count.payments > 0) {
    return fail(`该供应商已有 ${s._count.purchaseOrders} 张采购单、${s._count.payments} 笔付款记录，不能删除；请改为停用`, 409, 409);
  }
  await prisma.supplier.delete({ where: { id: s.id } });
  await logAudit({
    action: "SUPPLIER_DELETE", entityType: "Supplier", entityId: s.id,
    summary: `删除供应商 ${s.supplierNo} ${s.name}（无业务引用）`, actor: session.user,
  });
  return ok({ id: s.id });
}
