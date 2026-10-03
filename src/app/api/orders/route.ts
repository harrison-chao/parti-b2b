import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { genOrderNo, genDisplayOrderNo } from "@/lib/order-no";
import { genWorkOrderNo } from "@/lib/utils";
import { LEVEL_DISCOUNT, calcPricing } from "@/lib/pricing";
import { loadSettings, pricingFieldsToConfig } from "@/lib/settings";
import { notifyFeishu } from "@/lib/feishu";
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
  // W1 新口径：工序多选存码、表面处理拆两码、Base 原始尺寸文本
  processCodes: z.array(z.string()).optional().nullable(),
  surfaceProcessCode: z.string().optional().nullable(),
  surfaceColorCode: z.string().optional().nullable(),
  legacyRawSize: z.string().optional().nullable(),
  spec: z.string().optional().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  targetPrice: z.number().nonnegative().optional().nullable(),
  // 新上传走 /api/files 私有桶转发；http(s) 为兼容旧数据
  drawingUrl: z
    .string()
    .refine((v) => v.startsWith("/api/files?path=") || /^https?:\/\//.test(v), "无效的图纸地址")
    .optional()
    .nullable(),
  drawingFileName: z.string().optional().nullable(),
  isCustom: z.boolean().optional(),
});

const createSchema = z.object({
  // W1: ADMIN 代下单时必传 dealerId；DEALER 自助下单忽略此字段
  dealerId: z.string().optional().nullable(),
  targetDeliveryDate: z.string(),
  receiverName: z.string().min(1),
  receiverPhone: z.string().min(1),
  receiverAddress: z.string().min(1),
  remark: z.string().optional().nullable(),
  // W1: 内部单价格备注（D2：算价走引擎，微信谈的实价差异写这里）
  priceNote: z.string().optional().nullable(),
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
  // W1: 双入口——DEALER 门户自助下单；ADMIN 内部代下单（指定 dealerId，免审，自动派单）
  const isInternal = session.user.role === "ADMIN";
  if (!isInternal && session.user.role !== "DEALER") return fail("无权创建订单", 403, 403);

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;
  if (isInternal && !data.dealerId) return fail("内部代下单必须指定客户 dealerId");

  const dealerId = isInternal ? data.dealerId! : session.user.dealerId!;

  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!dealer) return fail("经销商不存在", 404, 404);
  // Pricing uses the admin-configured discount rates (falls back to built-in defaults).
  const settings = await loadSettings();
  const pricingConfig = pricingFieldsToConfig(settings.pricingFields);
  const discount = settings.discountRates[dealer.priceLevel] ?? LEVEL_DISCOUNT[dealer.priceLevel];

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
      // Server-side authoritative pricing for PROFILE (client-provided price is advisory),
      // using the same engine as GET /api/pricing/calculate.
      const length = l.cutLengthMm ?? l.lengthMm;
      if (!length || length <= 0) throw new Error(`PROFILE 行缺有效切长`);
      const pricing = calcPricing(length, dealer.priceLevel, pricingConfig, settings.discountRates);
      return { ...l, unitPrice: pricing.dealerPrice };
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
    return fail("客户已停用，不能创建新订单");
  }
  if (data.crmCustomerId && !isInternal) {
    const customer = await prisma.crmCustomer.findFirst({ where: { id: data.crmCustomerId, dealerId } });
    if (!customer) return fail("CRM 客户不存在或不属于当前经销商");
  }
  if (data.crmOpportunityId && !isInternal) {
    const opportunity = await prisma.crmOpportunity.findFirst({ where: { id: data.crmOpportunityId, dealerId, customerId: data.crmCustomerId ?? undefined } });
    if (!opportunity) return fail("CRM 商机不存在或不属于当前经销商");
  }
  // 信用额度仅约束经销商门户自助单；内部代下单的款项在系统外沟通（D2），不做拦截
  if (!isInternal && dealer.paymentMethod === "CREDIT" && !dealer.allowOverCredit && Number(dealer.creditBalance) < totalAmount) {
    return fail(`信用额度不足（可用 ${Number(dealer.creditBalance).toFixed(2)}，订单 ${totalAmount.toFixed(2)}）`);
  }

  const orderNo = genOrderNo();
  const displayOrderNo = await genDisplayOrderNo();

  try {
    const created = await prisma.salesOrder.create({
      data: {
        orderNo,
        displayOrderNo,
        dealerId,
        targetDeliveryDate: new Date(data.targetDeliveryDate),
        dealerAccount: session.user.email,
        receiverName: data.receiverName,
        receiverPhone: data.receiverPhone,
        receiverAddress: data.receiverAddress,
        remark: data.remark ?? null,
        crmCustomerId: isInternal ? null : (data.crmCustomerId ?? null),
        crmOpportunityId: isInternal ? null : (data.crmOpportunityId ?? null),
        totalAmount,
        // W1: 内部单免审直接确认（D2/D6 决策）；门户单保持草稿→提交审核
        orderStatus: isInternal ? "CONFIRMED" : "DRAFT",
        paymentStatus: "UNPAID",
        createdVia: isInternal ? "INTERNAL" : "PORTAL",
        createdByUserId: isInternal ? session.user.id : null,
        priceNote: isInternal ? (data.priceNote ?? null) : null,
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
            processCodes: l.processCodes ?? [],
            surfaceProcessCode: l.surfaceProcessCode ?? null,
            surfaceColorCode: l.surfaceColorCode ?? null,
            legacyRawSize: l.legacyRawSize ?? null,
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

    // W1: 内部单自动派单到唯一活跃车间（单车间现实），无审核动作
    let workOrderNo: string | null = null;
    if (isInternal) {
      const producible = created.lines.some((l) => l.lineType !== "OUTSOURCED");
      if (producible) {
        const workshop = await prisma.workshop.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
        if (!workshop) return fail("没有活跃车间，无法自动派单（订单已创建，请手动派单）", 200, 200);
        workOrderNo = genWorkOrderNo();
        await prisma.$transaction(async (tx) => {
          await tx.workOrder.create({
            data: {
              workOrderNo: workOrderNo!,
              orderNo,
              workshopId: workshop.id,
              status: "PENDING_START",
              committedDeliveryDate: new Date(data.targetDeliveryDate),
              qcRequired: false,
              currentNote: "内部代下单自动派单",
              assignedBy: session.user.name,
            },
          });
          await tx.workOrderEvent.create({
            data: {
              workOrderId: (await tx.workOrder.findUniqueOrThrow({ where: { workOrderNo: workOrderNo! } })).id,
              fromStatus: null,
              toStatus: "PENDING_START",
              note: `内部代下单自动派发至 ${workshop.name}`,
              operatorUserId: session.user.id,
              operatorName: session.user.name,
            },
          });
          await tx.salesOrder.update({ where: { orderNo }, data: { orderStatus: "PRODUCING" } });
        });
      }
    }
    if (!isInternal && data.crmCustomerId) {
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
    if (isInternal) {
      const dealer2 = await prisma.dealer.findUnique({ where: { id: dealerId }, select: { nickname: true, companyName: true } });
      void notifyFeishu("新加工单", [
        `单号 ${displayOrderNo}`,
        `客户 ${(dealer2?.nickname || dealer2?.companyName || "").slice(0, 16)}`,
        `交期 ${new Date(data.targetDeliveryDate).toLocaleDateString("zh-CN")}`,
        ...created.lines.slice(0, 8).map((l) => `${l.sku}${l.cutLengthMm ? " " + l.cutLengthMm + "mm" : ""} ×${l.quantity}`),
        ...(created.lines.length > 8 ? [`…共 ${created.lines.length} 行`] : []),
      ]);
    }
    return ok({ ...created, autoDispatchedWorkOrderNo: workOrderNo ?? null });
  } catch (e: any) {
    return fail("创建失败: " + (e?.message ?? e));
  }
}
