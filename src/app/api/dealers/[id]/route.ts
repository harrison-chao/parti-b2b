import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const patchSchema = z.object({
  companyName: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  legalName: z.string().optional().nullable(),
  taxNo: z.string().optional().nullable(),
  invoiceTitle: z.string().optional().nullable(),
  invoiceType: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankAccount: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  salesOwner: z.string().optional().nullable(),
  creditDays: z.number().int().nonnegative().optional(),
  allowOverCredit: z.boolean().optional(),
  remark: z.string().optional().nullable(),
  priceLevel: z.enum(["A", "B", "C", "D", "E"]).optional(),
  creditLimit: z.number().nonnegative().optional(),
  paymentMethod: z.enum(["PREPAID", "DEPOSIT", "CREDIT"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
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
  if (session.user.role !== "ADMIN") return fail("仅管理员可修改", 403, 403);
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  const { contacts, ...dealerPatch } = d;
  const updateData: any = { ...dealerPatch };
  if (d.creditLimit !== undefined) {
    const existing = await prisma.dealer.findUnique({ where: { id: params.id } });
    if (!existing) return fail("经销商不存在", 404, 404);
    const used = Number(existing.creditLimit) - Number(existing.creditBalance);
    updateData.creditBalance = Math.max(0, d.creditLimit - used);
  }
  const dealer = await prisma.$transaction(async (tx) => {
    const updated = await tx.dealer.update({ where: { id: params.id }, data: updateData });
    if (contacts) {
      await tx.dealerContact.deleteMany({ where: { dealerId: params.id } });
      if (contacts.length > 0) {
        await tx.dealerContact.createMany({
          data: contacts.map((c, idx) => ({
            dealerId: params.id,
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
  return ok(dealer);
}
