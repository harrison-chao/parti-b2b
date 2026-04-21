import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role === "DEALER") return fail("无权访问", 403, 403);
  const dealers = await prisma.dealer.findMany({
    orderBy: { createdAt: "desc" },
    include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, _count: { select: { salesOrders: true } } },
  });
  return ok({ dealers });
}

const contactSchema = z.object({
  id: z.string().optional(),
  role: z.string().default("业务联系人"),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  wechat: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
  remark: z.string().optional().nullable(),
});

const createSchema = z.object({
  dealerNo: z.string().min(1),
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
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
  priceLevel: z.enum(["A", "B", "C", "D", "E"]),
  creditLimit: z.number().nonnegative(),
  paymentMethod: z.enum(["PREPAID", "DEPOSIT", "CREDIT"]),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  contacts: z.array(contactSchema).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可创建经销商", 403, 403);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  const existing = await prisma.dealer.findUnique({ where: { dealerNo: d.dealerNo } });
  if (existing) return fail("经销商编号已存在");
  const dealer = await prisma.dealer.create({
    data: {
      dealerNo: d.dealerNo,
      companyName: d.companyName,
      contactName: d.contactName,
      contactPhone: d.contactPhone,
      legalName: d.legalName ?? null,
      taxNo: d.taxNo ?? null,
      invoiceTitle: d.invoiceTitle ?? null,
      invoiceType: d.invoiceType ?? null,
      bankName: d.bankName ?? null,
      bankAccount: d.bankAccount ?? null,
      region: d.region ?? null,
      industry: d.industry ?? null,
      source: d.source ?? null,
      salesOwner: d.salesOwner ?? null,
      creditDays: d.creditDays ?? 0,
      allowOverCredit: d.allowOverCredit ?? false,
      remark: d.remark ?? null,
      priceLevel: d.priceLevel,
      creditLimit: d.creditLimit,
      creditBalance: d.creditLimit,
      paymentMethod: d.paymentMethod,
      status: d.status ?? "ACTIVE",
      contacts: {
        create: (d.contacts?.length ? d.contacts : [{ role: "业务联系人", name: d.contactName, phone: d.contactPhone, isPrimary: true }]).map((c, idx) => ({
          role: c.role,
          name: c.name,
          phone: c.phone ?? null,
          email: c.email ?? null,
          wechat: c.wechat ?? null,
          isPrimary: c.isPrimary ?? idx === 0,
          remark: c.remark ?? null,
        })),
      },
    },
    include: { contacts: true },
  });
  return ok(dealer);
}
