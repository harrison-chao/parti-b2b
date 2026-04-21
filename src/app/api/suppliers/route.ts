import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const contactSchema = z.object({
  role: z.string().default("业务联系人"),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  wechat: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
  remark: z.string().optional().nullable(),
});

const createSchema = z.object({
  supplierNo: z.string().min(1),
  name: z.string().min(1),
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
  contacts: z.array(contactSchema).optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "1";
  const suppliers = await prisma.supplier.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { supplierNo: "asc" },
    include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
  });
  return ok(suppliers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可维护供应商", 403, 403);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  const exists = await prisma.supplier.findUnique({ where: { supplierNo: d.supplierNo } });
  if (exists) return fail("供应商编号已存在");
  const s = await prisma.supplier.create({
    data: {
      supplierNo: d.supplierNo,
      name: d.name,
      category: d.category ?? "OTHER",
      contactName: d.contactName ?? null,
      contactPhone: d.contactPhone ?? null,
      address: d.address ?? null,
      taxNo: d.taxNo ?? null,
      invoiceType: d.invoiceType ?? null,
      bankName: d.bankName ?? null,
      bankAccount: d.bankAccount ?? null,
      paymentTerms: d.paymentTerms ?? null,
      paymentDays: d.paymentDays ?? 0,
      defaultLeadTimeDays: d.defaultLeadTimeDays ?? 0,
      serviceScope: d.serviceScope ?? null,
      remark: d.remark ?? null,
      contacts: {
        create: (d.contacts?.length ? d.contacts : d.contactName ? [{ role: "业务联系人", name: d.contactName, phone: d.contactPhone, isPrimary: true }] : []).map((c, idx) => ({
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
  return ok(s);
}
