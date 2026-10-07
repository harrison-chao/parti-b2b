import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireRole } from "@/lib/api";
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
  supplierNo: z.string().optional(),
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
  // 供应商档案含联系人/银行账号：仅管理员可见
  if (session.user.role !== "ADMIN") return fail("无权访问", 403, 403);
  const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "1";
  const suppliers = await prisma.supplier.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { supplierNo: "asc" },
    include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
  });
  return ok(suppliers);
}

export async function POST(req: NextRequest) {
  const guard = await requireRole("ADMIN");
  if (guard.response) return guard.response;
  const session = guard.session;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  // 编号统一 SUP-xxx：留空自动顺延（取现有最大数字后缀 +1），不再出现 SP/SUP 双前缀
  const all = await prisma.supplier.findMany({ select: { supplierNo: true } });
  const maxNo = all.reduce((m, x) => {
    const n = /^SUP-(\d+)$/.exec(x.supplierNo.trim().toUpperCase());
    return n ? Math.max(m, parseInt(n[1], 10)) : m;
  }, 0);
  const supplierNo = (d.supplierNo?.trim() || `SUP-${String(maxNo + 1).padStart(3, "0")}`).toUpperCase();
  const exists = await prisma.supplier.findUnique({ where: { supplierNo } });
  if (exists) return fail(`供应商编号 ${supplierNo} 已存在`);
  const s = await prisma.supplier.create({
    data: {
      supplierNo,
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
