import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";
import { OrderCreateError, resolveOrderLines } from "@/lib/order-create";
import { loadSettings, pricingFieldsToConfig } from "@/lib/settings";

// 经销商编辑自己的草稿单（DRAFT/MODIFYING）：更新头信息 + 删行重建。
// 行计价走服务端权威口径（与创建同源 resolveOrderLines），防止客户端改价。
const draftUpdateSchema = z.object({
  targetDeliveryDate: z.string().min(1),
  receiverName: z.string().min(1),
  receiverPhone: z.string().min(1),
  receiverAddress: z.string().min(1),
  remark: z.string().optional().nullable(),
  lines: z.array(z.any()).min(1),
});

export async function PUT(req: NextRequest, { params }: { params: { orderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "DEALER") return fail("仅经销商可编辑草稿", 403, 403);

  const order = await prisma.salesOrder.findUnique({ where: { orderNo: params.orderNo } });
  if (!order) return fail("订单不存在", 404, 404);
  if (order.dealerId !== session.user.dealerId) return fail("无权访问", 403, 403);
  if (order.orderStatus !== "DRAFT" && order.orderStatus !== "MODIFYING") {
    return fail("仅草稿/待确认状态可编辑");
  }

  const parsed = draftUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;

  const dealer = await prisma.dealer.findUnique({ where: { id: session.user.dealerId! } });
  if (!dealer || dealer.status !== "ACTIVE") return fail("客户已停用");
  const settings = await loadSettings();
  const pricingConfig = pricingFieldsToConfig(settings.pricingFields);

  let resolvedLines: any[];
  try {
    resolvedLines = await resolveOrderLines(prisma, {
      lines: data.lines, dealer, pricingConfig, discountRates: settings.discountRates as Record<string, number>,
    });
  } catch (e: any) {
    if (e instanceof OrderCreateError) return fail(e.message);
    return fail(String(e?.message ?? e));
  }
  const totalAmount = resolvedLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.salesOrderLine.deleteMany({ where: { orderNo: params.orderNo } });
    return tx.salesOrder.update({
      where: { orderNo: params.orderNo },
      data: {
        targetDeliveryDate: new Date(data.targetDeliveryDate),
        receiverName: data.receiverName,
        receiverPhone: data.receiverPhone,
        receiverAddress: data.receiverAddress,
        remark: data.remark ?? null,
        totalAmount,
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
            processCodes: l.processCodes ?? [],
            surfaceProcessCode: l.surfaceProcessCode ?? null,
            surfaceColorCode: l.surfaceColorCode ?? null,
            spec: l.spec ?? null,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            costSnapshot: (l as any).costSnapshot ?? null,
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
  });
  return ok(updated);
}

export async function GET(_req: NextRequest, { params }: { params: { orderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const role = session.user.role;

  const order = await prisma.salesOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: { lines: { orderBy: { lineNo: "asc" } }, dealer: true },
  });
  if (!order) return fail("订单不存在", 404, 404);

  if (role === "DEALER") {
    if (order.dealerId !== session.user.dealerId) return fail("无权访问", 403, 403);
    // 出站白名单：剥除成本快照/内部备注/价格备注/完整客户档案（列级防泄露）
    const { internalRemark, priceNote, dealer, lines, ...rest } = order;
    return ok({
      ...rest,
      dealer: dealer ? { id: dealer.id, dealerNo: dealer.dealerNo, companyName: dealer.companyName, nickname: dealer.nickname } : null,
      lines: lines.map(({ costSnapshot, ...l }) => l),
    });
  }

  if (role === "WORKSHOP") {
    // 车间只需要生产信息：裁剪 dealer 主体（信用额度/银行账号/税号等 PII）
    const { dealer, ...rest } = order;
    return ok({
      ...rest,
      dealer: dealer
        ? {
            id: dealer.id,
            dealerNo: dealer.dealerNo,
            companyName: dealer.companyName,
            customerType: dealer.customerType,
            nickname: dealer.nickname,
            contactName: dealer.contactName,
            contactPhone: dealer.contactPhone,
          }
        : null,
    });
  }

  return ok(order);
}
