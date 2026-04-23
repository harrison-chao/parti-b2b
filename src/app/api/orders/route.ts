import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { genOrderNo } from "@/lib/utils";
import { LEVEL_DISCOUNT } from "@/lib/pricing";
import { z } from "zod";

const lineSchema = z.object({
  lineType: z.enum(["PROFILE", "HARDWARE", "OUTSOURCED"]).default("PROFILE"),
  sku: z.string(),
  productName: z.string(),
  productId: z.string().optional().nullable(),
  rawProductId: z.string().optional().nullable(),
  lengthMm: z.number().positive().optional().nullable(),
  cutLengthMm: z.number().int().positive().optional().nullable(),
  surfaceTreatment: z.string().optional().nullable(),
  preprocessing: z.string().optional().nullable(),
  spec: z.string().optional().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  targetPrice: z.number().nonnegative().optional().nullable(),
  drawingUrl: z.string().url().optional().nullable(),
  drawingFileName: z.string().optional().nullable(),
  isCustom: z.boolean().optional(),
});

const createSchema = z.object({
  targetDeliveryDate: z.string(),
  receiverName: z.string().min(1),
  receiverPhone: z.string().min(1),
  receiverAddress: z.string().min(1),
  remark: z.string().optional().nullable(),
  crmCustomerId: z.string().optional().nullable(),
  crmOpportunityId: z.string().optional().nullable(),
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
  const discount = LEVEL_DISCOUNT[dealer.priceLevel];

  // Server-side authoritative pricing for HARDWARE (client-provided price is advisory).
  const hardwareIds = data.lines.filter((l) => l.lineType === "HARDWARE" && l.productId).map((l) => l.productId!);
  const hardwareProducts = hardwareIds.length
    ? await prisma.product.findMany({ where: { id: { in: hardwareIds }, category: "HARDWARE" } })
    : [];
  const hwMap = new Map(hardwareProducts.map((p) => [p.id, p]));

  // Validate PROFILE lines reference a real raw-material product.
  const rawIds = data.lines.filter((l) => l.lineType === "PROFILE" && l.rawProductId).map((l) => l.rawProductId!);
  const rawProducts = rawIds.length
    ? await prisma.product.findMany({ where: { id: { in: rawIds }, category: "PROFILE", isRawMaterial: true } })
    : [];
  const rawMap = new Map(rawProducts.map((p) => [p.id, p]));

  const resolvedLines = data.lines.map((l) => {
    if (l.lineType === "PROFILE") {
      if (!l.rawProductId) throw new Error(`PROFILE 行缺原料型材`);
      if (!rawMap.has(l.rawProductId)) throw new Error(`原料型材不存在或非原料: ${l.rawProductId}`);
    }
    if (l.lineType === "HARDWARE") {
      if (!l.productId) throw new Error(`HARDWARE 行缺 productId`);
      const prod = hwMap.get(l.productId);
      if (!prod) throw new Error(`HARDWARE 产品不存在: ${l.productId}`);
      if (prod.drawingRequired && !l.drawingUrl) throw new Error(`${prod.sku} 需上传图纸`);
      const unitPrice = Math.round(Number(prod.retailPrice) * discount * 100) / 100;
      return {
        ...l,
        sku: prod.sku,
        productName: prod.productName,
        spec: prod.spec ?? null,
        unitPrice,
      };
    }
    return l;
  });

  const totalAmount = resolvedLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  if (dealer.status !== "ACTIVE") {
    return fail("经销商已停用，不能创建新订单");
  }
  if (data.crmCustomerId) {
    const customer = await prisma.crmCustomer.findFirst({ where: { id: data.crmCustomerId, dealerId } });
    if (!customer) return fail("CRM 客户不存在或不属于当前经销商");
  }
  if (data.crmOpportunityId) {
    const opportunity = await prisma.crmOpportunity.findFirst({ where: { id: data.crmOpportunityId, dealerId, customerId: data.crmCustomerId ?? undefined } });
    if (!opportunity) return fail("CRM 商机不存在或不属于当前经销商");
  }
  if (dealer.paymentMethod === "CREDIT" && !dealer.allowOverCredit && Number(dealer.creditBalance) < totalAmount) {
    return fail(`信用额度不足（可用 ${Number(dealer.creditBalance).toFixed(2)}，订单 ${totalAmount.toFixed(2)}）`);
  }

  const orderNo = genOrderNo();

  try {
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
        crmCustomerId: data.crmCustomerId ?? null,
        crmOpportunityId: data.crmOpportunityId ?? null,
        totalAmount,
        orderStatus: "DRAFT",
        paymentStatus: "UNPAID",
        lines: {
          create: resolvedLines.map((l, idx) => ({
            lineNo: idx + 1,
            lineType: l.lineType,
            sku: l.sku,
            productName: l.productName,
            productId: l.lineType === "HARDWARE" ? (l.productId ?? null) : null,
            rawProductId: l.lineType === "PROFILE" ? (l.rawProductId ?? null) : null,
            cutLengthMm: l.cutLengthMm ?? null,
            lengthMm: l.lengthMm ?? null,
            surfaceTreatment: l.surfaceTreatment ?? null,
            preprocessing: l.preprocessing ?? null,
            spec: l.spec ?? null,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            targetPrice: l.targetPrice ?? null,
            lineAmount: l.quantity * l.unitPrice,
            drawingUrl: l.drawingUrl ?? null,
            drawingFileName: l.drawingFileName ?? null,
            isCustom: l.isCustom ?? (l.lineType === "PROFILE"),
            includedInProfit: l.lineType !== "OUTSOURCED",
          })),
        },
      },
      include: { lines: true },
    });
    if (data.crmCustomerId) {
      await prisma.crmCustomer.update({
        where: { id: data.crmCustomerId },
        data: { stage: "QUOTED", lastContactAt: new Date() },
      });
      await prisma.crmContactLog.create({
        data: {
          dealerId,
          customerId: data.crmCustomerId,
          opportunityId: data.crmOpportunityId ?? null,
          method: "OTHER",
          content: `已创建报价/订单草稿 ${created.orderNo}，金额 ${totalAmount.toFixed(2)}`,
          outcome: "已生成报价",
          createdBy: session.user.name,
        },
      });
    }
    return ok(created);
  } catch (e: any) {
    return fail("创建失败: " + (e?.message ?? e));
  }
}
