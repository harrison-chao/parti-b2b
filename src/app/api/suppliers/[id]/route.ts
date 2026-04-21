import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
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
