import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAvailability } from "@/lib/inventory-analytics";
import { aggregateOrderRequirements } from "@/lib/stock-consume";
import { ok, fail } from "@/lib/api";
import { genOrderNo, genDisplayOrderNo } from "@/lib/order-no";
import { getMaterialShortages, formatShortages } from "@/lib/stock-consume";
import { queueLoad, skuCycleStats, globalCycleStats, suggestDeliveryDays } from "@/lib/delivery-insight";
import { genWorkOrderNo } from "@/lib/utils";
import { LEVEL_DISCOUNT, calcPricing } from "@/lib/pricing";
import { resolveRawBasis } from "@/lib/pricing-source";
import { surfaceMismatch } from "@/lib/surface";
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
    ? await prisma.product.findMany({ where: { id: { in: rawIds }, category: "PROFILE", isRawMaterial: true, isActive: true } })
    : [];
  // 停用原料给出可操作的报错（表面化迁移后旧裸料已停用，防新单死绑 0 库存 SKU）；rawIds 先去重防同料多行误报
  const uniqueRawIds = [...new Set(rawIds)];
  if (uniqueRawIds.length > rawProducts.length) {
    const banned = await prisma.product.findMany({
      where: { id: { in: uniqueRawIds }, OR: [{ isActive: false }, { isRawMaterial: false }, { category: { not: "PROFILE" } }] },
      select: { sku: true },
    });
    return fail(`原料已停用或不可用：${banned.map((b) => b.sku).join("、") || uniqueRawIds.join("、")}，请改选对应表面/长度的新原料 SKU`);
  }
  const rawMap = new Map(rawProducts.map((p) => [p.id, p]));

  // SKU 级计价基数（米重/良率/每米价三级回退），同原料只解析一次
  const basisMap = new Map<string, Awaited<ReturnType<typeof resolveRawBasis>>>();
  for (const raw of rawProducts) {
    if (!basisMap.has(raw.id)) basisMap.set(raw.id, await resolveRawBasis(raw));
  }

  let resolvedLines: any[] = [];
  try {
    resolvedLines = data.lines.map((l) => {
    if (l.lineType === "PROFILE") {
      if (!l.rawProductId) throw new Error(`PROFILE 行缺原料型材`);
      if (!rawMap.has(l.rawProductId)) throw new Error(`原料型材不存在或非原料: ${l.rawProductId}`);
      // 第 3 步绑定校验：原料 SKU 已按表面拆分，行表面必须与原料一致，否则扣错桶/假性缺料
      const rawProd = rawMap.get(l.rawProductId)!;
      const mismatch = surfaceMismatch(l, rawProd);
      if (mismatch) throw new Error(`行 ${l.sku}：${mismatch}`);
      // Server-side authoritative pricing for PROFILE (client-provided price is advisory),
      // using the same engine as GET /api/pricing/calculate.
      const length = l.cutLengthMm ?? l.lengthMm;
      if (!length || length <= 0) throw new Error(`PROFILE 行缺有效切长`);
      const basis = basisMap.get(l.rawProductId);
      const pricing = calcPricing(length, dealer.priceLevel, pricingConfig, settings.discountRates, basis);
      // 口径切换：下单冻结成本构成，利润页不再随参数/批次价漂移
      const costSnapshot = JSON.stringify({
        source: pricing.costSource,
        perMeterPrice: pricing.perMeterPrice,
        meterWeight: pricing.meterWeight,
        yieldRate: pricing.yieldRate,
        unitCost: pricing.totalCost,
        cutLengthMm: length,
        pricedAt: new Date().toISOString(),
      });
      return { ...l, unitPrice: pricing.dealerPrice, costSnapshot };
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
  } catch (e: any) {
    // 行校验（缺原料/不存在/表面与原料不符）按业务错误返回，而非 500
    return fail(String(e?.message ?? e));
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
    // W1: 内部单自动派单到唯一活跃车间（单车间现实），无审核动作
    // P1: 自动派单同样执行交期校准与缺料提示（直销客户主流程不能绕过守卫）
    let workOrderNo: string | null = null;
    let dispatchWarning: string | null = null;
    if (isInternal) {
      const producible = created.lines.some((l) => l.lineType !== "OUTSOURCED");
      if (producible) {
        const workshop = await prisma.workshop.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
        if (!workshop) return fail("没有活跃车间，无法自动派单（订单已创建，请手动派单）", 200, 200);

        // 交期校准：客户要求早于产能建议 → 承诺自动上调到建议值（内部单即车间自己承诺，系统兜住现实）
        const rawIds = [...new Set(created.lines.filter((l) => l.rawProductId).map((l) => l.rawProductId!))];
        const [load, skuStats, globalStats] = await Promise.all([
          queueLoad(),
          rawIds.length ? skuCycleStats(rawIds) : Promise.resolve(new Map()),
          globalCycleStats(),
        ]);
        const skuStat = rawIds.length === 1 ? (skuStats.get(rawIds[0]) ?? null) : (skuStats.size ? [...skuStats.values()][0] : null);
        const suggestion = suggestDeliveryDays(skuStat ?? globalStats, load, new Date(data.targetDeliveryDate));
        const suggestedDate = new Date(Date.now() + suggestion.days * 86400000);
        const customerDate = new Date(data.targetDeliveryDate);
        const committed = customerDate < suggestedDate ? suggestedDate : customerDate;
        if (committed > customerDate) {
          dispatchWarning = `承诺交期已按产能校准：${customerDate.toLocaleDateString("zh-CN")} → ${committed.toLocaleDateString("zh-CN")}（${suggestion.basis}）`;
        }

        // 缺料提示（不阻塞快速建单；开工处有硬校验）
        const shortages = await getMaterialShortages(prisma, orderNo, workshop.id);
        const noteParts = ["内部代下单自动派单"];
        if (shortages.length) {
          noteParts.push(`【缺料提示】${formatShortages(shortages)}`);
          dispatchWarning = `${dispatchWarning ? dispatchWarning + "；" : ""}库存不足：${formatShortages(shortages)}（开工时将再校验）`;
        }

        workOrderNo = genWorkOrderNo();
        await prisma.$transaction(async (tx) => {
          await tx.workOrder.create({
            data: {
              workOrderNo: workOrderNo!,
              orderNo,
              workshopId: workshop.id,
              status: "PENDING_START",
              committedDeliveryDate: committed,
              committedOverrideReason: null,
              qcRequired: false,
              currentNote: noteParts.join(" · "),
              assignedBy: session.user.name,
            },
          });
          await tx.workOrderEvent.create({
            data: {
              workOrderId: (await tx.workOrder.findUniqueOrThrow({ where: { workOrderNo: workOrderNo! } })).id,
              fromStatus: null,
              toStatus: "PENDING_START",
              note: `内部代下单自动派发至 ${workshop.name}${dispatchWarning ? "；" + dispatchWarning : ""}`,
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
    // 下单即示缺料（全网可用量 = 现存 − 未结工单占用；非阻断，提醒先备料/先采购）
    let materialWarning: string | null = null;
    try {
      const required = await aggregateOrderRequirements(prisma, created.orderNo);
      const { totalBySku } = await getAvailability(prisma);
      const lacking: string[] = [];
      for (const [sku, item] of required.entries()) {
        const avail = totalBySku.get(sku);
        if (!avail || avail.available < item.quantity) {
          lacking.push(`${sku} 需 ${item.quantity}，全网可用 ${avail?.available ?? 0}（现存 ${avail?.onHand ?? 0} − 占用 ${avail?.allocated ?? 0}）`);
        }
      }
      if (lacking.length > 0) materialWarning = `原料可用量不足：${lacking.join("；")}`;
    } catch { /* 提醒失败不影响下单 */ }

    return ok({ ...created, autoDispatchedWorkOrderNo: workOrderNo ?? null, dispatchWarning, materialWarning });
  } catch (e: any) {
    return fail("创建失败: " + (e?.message ?? e));
  }
}
