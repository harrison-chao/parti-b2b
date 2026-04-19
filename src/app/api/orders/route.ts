import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { genOrderNo } from "@/lib/utils";
import { z } from "zod";

const lineSchema = z.object({
  sku: z.string(),
  productName: z.string(),
  surfaceTreatment: z.string().optional().nullable(),
  preprocessing: z.string().optional().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  isCustom: z.boolean().optional(),
});

const createSchema = z.object({
  targetDeliveryDate: z.string(),
  receiverName: z.string().min(1),
  receiverPhone: z.string().min(1),
  receiverAddress: z.string().min(1),
  remark: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const dealerId = searchParams.get("dealerId");
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20");

  const where: any = {};
  if (status) where.orderStatus = status;
  if (session.user.role === "DEALER") {
    where.dealerId = session.user.dealerId;
  } else if (dealerId) {
    where.dealerId = dealerId;
  }

  const [total, orders] = await Promise.all([
    prisma.salesOrder.count({ where }),
    prisma.salesOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { dealer: { select: { companyName: true, dealerNo: true } }, lines: true },
    }),
  ]);
  return ok({ total, page, pageSize, orders });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "DEALER") return fail("仅经销商可创建订单", 403, 403);
  const dealerId = session.user.dealerId!;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;

  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!dealer) return fail("经销商不存在", 404, 404);

  const totalAmount = data.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  if (dealer.paymentMethod === "CREDIT" && Number(dealer.creditBalance) < totalAmount) {
    return fail(`信用额度不足（可用 ${Number(dealer.creditBalance).toFixed(2)}，订单 ${totalAmount.toFixed(2)}）`);
  }

  const orderNo = genOrderNo();

  const created = await prisma.salesOrder.create({
    data: {
      orderNo,
      dealerId,
      targetDeliveryDate: new Date(data.targetDeliveryDate),
      dealerAccount: session.user.email,
      receiverName: data.receiverName,
      receiverPhone: data.receiverPhone,
      receiverAddress: data.receiverAddress,
      remark: data.remark ?? null,
      totalAmount,
      orderStatus: "DRAFT",
      paymentStatus: "UNPAID",
      lines: {
        create: data.lines.map((l, idx) => ({
          lineNo: idx + 1,
          sku: l.sku,
          productName: l.productName,
          surfaceTreatment: l.surfaceTreatment ?? null,
          preprocessing: l.preprocessing ?? null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineAmount: l.quantity * l.unitPrice,
          isCustom: l.isCustom ?? false,
        })),
      },
    },
    include: { lines: true },
  });

  return ok(created);
}
