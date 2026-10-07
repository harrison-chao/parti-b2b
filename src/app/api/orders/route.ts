import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import {
  OrderCreateError, resolveOrderLines, autoDispatchInternalOrder,
  materialShortageWarning, crmTraceAfterCreate, notifyInternalOrderCreated,
} from "@/lib/order-create";
import { genOrderNo, genDisplayOrderNo } from "@/lib/order-no";
import { loadSettings, pricingFieldsToConfig } from "@/lib/settings";
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
  // 经销商只看自己的单：行成本快照与内部备注不出网（列级防泄露，与详情接口同口径）
  const safeOrders = session.user.role === "DEALER"
    ? orders.map((o) => {
        const { internalRemark, priceNote, lines, ...rest } = o;
        return { ...rest, lines: lines.map(({ costSnapshot, ...l }) => l) };
      })
    : orders;
  return ok({ total, page, pageSize, orders: safeOrders });
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

  // 行级服务端权威解析（计价/原料校验/成本快照冻结），业务错误按 4xx 返回
  let resolvedLines: any[] = [];
  try {
    resolvedLines = await resolveOrderLines(prisma, {
      lines: data.lines, dealer, pricingConfig, discountRates: settings.discountRates as Record<string, number>,
    });
  } catch (e: any) {
    if (e instanceof OrderCreateError) return fail(e.message);
    return fail("行解析失败: " + (e?.message ?? e));
  }

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

  let orderNo = "";
  let displayOrderNo = "";
  let created: Awaited<ReturnType<typeof createOneOrder>> | null = null;
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    orderNo = genOrderNo();
    displayOrderNo = await genDisplayOrderNo();
    try {
      created = await createOneOrder(orderNo, displayOrderNo);
    } catch (e: any) {
      // P2002：并发下单撞 orderNo/displayOrderNo 唯一约束 → 换号重试
      if (e?.code === "P2002") continue;
      throw e;
    }
  }
  if (!created) return fail("单号生成冲突，请重试");

  async function createOneOrder(orderNo: string, displayOrderNo: string) {
    return prisma.salesOrder.create({
      data: {
        orderNo,
        displayOrderNo,
        dealerId,
        targetDeliveryDate: new Date(data.targetDeliveryDate),
        dealerAccount: session!.user.email,
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
        createdByUserId: isInternal ? session!.user.id : null,
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
  }

  try {
    // W1: 内部单自动派单到唯一活跃车间（单车间现实），无审核动作；派单同样执行交期校准与缺料提示
    let workOrderNo: string | null = null;
    let dispatchWarning: string | null = null;
    if (isInternal) {
      const dispatched = await autoDispatchInternalOrder(prisma, {
        orderNo, lines: created.lines, targetDeliveryDate: new Date(data.targetDeliveryDate),
        operator: { id: session.user.id, name: session.user.name },
      });
      if (dispatched) {
        workOrderNo = dispatched.workOrderNo;
        dispatchWarning = dispatched.dispatchWarning;
      }
    }
    if (!isInternal && data.crmCustomerId) {
      await crmTraceAfterCreate(dealerId, data.crmCustomerId, data.crmOpportunityId, created.orderNo, totalAmount, session.user.name);
    }
    if (isInternal) {
      const dealer2 = await prisma.dealer.findUnique({ where: { id: dealerId }, select: { nickname: true, companyName: true } });
      notifyInternalOrderCreated(
        displayOrderNo,
        dealer2?.nickname || dealer2?.companyName || "",
        new Date(data.targetDeliveryDate),
        created.lines,
      );
    }
    // 下单即示缺料（全网可用量 = 现存 − 未结工单占用；非阻断，提醒先备料/先采购）。
    // 全网库存/占用是厂内经营数据：仅内部单下发数字明细，经销商门户单不给（防枚举探测）
    let materialWarning: string | null = null;
    if (isInternal) {
      try {
        materialWarning = await materialShortageWarning(created.orderNo);
      } catch { /* 提醒失败不影响下单 */ }
    }

    await logAudit({
      action: "ORDER_CREATE", entityType: "SalesOrder", entityId: created.orderNo,
      summary: `${isInternal ? "内部代下单" : "门户下单"} ${created.displayOrderNo ?? created.orderNo} · ${created.lines.length} 行 · ¥${totalAmount.toFixed(2)}`,
      detail: { orderNo: created.orderNo, via: isInternal ? "INTERNAL" : "PORTAL", lines: created.lines.length, totalAmount },
      actor: session.user,
    });

    return ok({ ...created, autoDispatchedWorkOrderNo: workOrderNo ?? null, dispatchWarning, materialWarning });
  } catch (e: any) {
    return fail("创建失败: " + (e?.message ?? e));
  }
}
