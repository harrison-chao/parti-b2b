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
    include: { _count: { select: { salesOrders: true } } },
  });
  return ok({ dealers });
}

const createSchema = z.object({
  dealerNo: z.string().min(1),
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().min(1),
  priceLevel: z.enum(["A", "B", "C", "D", "E"]),
  creditLimit: z.number().nonnegative(),
  paymentMethod: z.enum(["PREPAID", "DEPOSIT", "CREDIT"]),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
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
      priceLevel: d.priceLevel,
      creditLimit: d.creditLimit,
      creditBalance: d.creditLimit,
      paymentMethod: d.paymentMethod,
      status: d.status ?? "ACTIVE",
    },
  });
  return ok(dealer);
}
