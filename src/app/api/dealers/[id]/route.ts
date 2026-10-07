import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireRole } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({
  companyName: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  // 类型纠错：经销商 ↔ 直销客户
  customerType: z.enum(["DEALER", "WALK_IN"]).optional(),
  // P1-D: 先款后产开关
  enforcePrepay: z.boolean().optional(),
  nickname: z.string().optional().nullable(),
  internalOwnerUserId: z.string().optional().nullable(),
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
  // Accept legacy D/E so editing a pre-migration dealer does not 400; UI only offers A/B/C.
  priceLevel: z.enum(["A", "B", "C", "D", "E"]).optional(),
  stampUrl: z.string().optional().nullable(),
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
  const guard = await requireRole("ADMIN");
  if (guard.response) return guard.response;
  const session = guard.session;
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

// 管理员删除客户（经销商/直销）：有订单/账号/付款/CRM 线索则拒绝（保历史），无引用才物理删除（地址/联系人级联）
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireRole("ADMIN");
  if (guard.response) return guard.response;
  const session = guard.session;
  const d = await prisma.dealer.findUnique({
    where: { id: params.id },
    include: { _count: { select: { salesOrders: true, users: true, payments: true, crmCustomers: true } } },
  });
  if (!d) return fail("客户不存在", 404, 404);
  const refs = d._count;
  const total = refs.salesOrders + refs.users + refs.payments + refs.crmCustomers;
  if (total > 0) {
    return fail(`该客户已有业务数据（订单 ${refs.salesOrders}、登录账号 ${refs.users}、付款 ${refs.payments}、CRM 线索 ${refs.crmCustomers}），不能删除；请改为停用`, 409, 409);
  }
  await prisma.dealer.delete({ where: { id: d.id } });
  await logAudit({
    action: "DEALER_DELETE", entityType: "Dealer", entityId: d.id,
    summary: `删除客户 ${d.dealerNo} ${d.companyName}（无业务引用）`, actor: session.user,
  });
  return ok({ id: d.id });
}
