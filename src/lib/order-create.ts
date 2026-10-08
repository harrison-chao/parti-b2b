import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcPricing, LEVEL_DISCOUNT } from "@/lib/pricing";
import { resolveRawBasis } from "@/lib/pricing-source";
import { surfaceMismatch } from "@/lib/surface";
import { getMaterialShortages, aggregateOrderRequirements, formatShortages } from "@/lib/stock-consume";
import { getAvailability } from "@/lib/inventory-analytics";
import { suggestDeliveryDays, queueLoad, skuCycleStats, globalCycleStats } from "@/lib/delivery-insight";
import { genWorkOrderNo } from "@/lib/utils";
import { notifyFeishu } from "@/lib/feishu";

type Db = Prisma.TransactionClient | PrismaClient;
type Dealer = { id: string; priceLevel: string; paymentMethod: string; allowOverCredit: boolean; creditBalance: unknown; status: string };

export class OrderCreateError extends Error {
  constructor(message: string) { super(message); }
}

/**
 * 下单行服务端权威解析（从 /api/orders POST 下沉）：
 * PROFILE 用与报价页同一计价引擎重算并冻结成本快照；HARDWARE 按档案零售价×等级折扣重算；
 * 原料有效性/表面一致性校验失败抛 OrderCreateError（业务错误，非 500）。
 */
export async function resolveOrderLines(
  db: Db,
  opts: {
    lines: any[];
    dealer: Dealer;
    pricingConfig: Parameters<typeof calcPricing>[2];
    discountRates: NonNullable<Parameters<typeof calcPricing>[3]>;
    opPrices?: Record<string, number>;
  },
): Promise<any[]> {
  const { lines, dealer, pricingConfig, discountRates, opPrices } = opts;
  const discount = discountRates[dealer.priceLevel as keyof typeof discountRates] ?? (LEVEL_DISCOUNT as Record<string, number>)[dealer.priceLevel];

  const hardwareIds = lines.filter((l) => l.lineType === "HARDWARE" && l.productId).map((l) => l.productId!);
  const hardwareProducts = hardwareIds.length
    ? await db.product.findMany({ where: { id: { in: hardwareIds }, category: "HARDWARE" } })
    : [];
  const hwMap = new Map(hardwareProducts.map((p) => [p.id, p]));

  const rawIds = lines.filter((l) => l.lineType === "PROFILE" && l.rawProductId).map((l) => l.rawProductId!);
  const rawProducts = rawIds.length
    ? await db.product.findMany({ where: { id: { in: rawIds }, category: "PROFILE", isRawMaterial: true, isActive: true } })
    : [];
  // 停用原料给出可操作的报错（表面化迁移后旧裸料已停用，防新单死绑 0 库存 SKU）；rawIds 先去重防同料多行误报
  const uniqueRawIds = [...new Set(rawIds)];
  if (uniqueRawIds.length > rawProducts.length) {
    const banned = await db.product.findMany({
      where: { id: { in: uniqueRawIds }, OR: [{ isActive: false }, { isRawMaterial: false }, { category: { not: "PROFILE" } }] },
      select: { sku: true },
    });
    throw new OrderCreateError(`原料已停用或不可用：${banned.map((b) => b.sku).join("、") || uniqueRawIds.join("、")}，请改选对应表面/长度的新原料 SKU`);
  }
  const rawMap = new Map(rawProducts.map((p) => [p.id, p]));

  // SKU 级计价基数（米重/良率/每米价三级回退），同原料只解析一次
  const basisMap = new Map<string, Awaited<ReturnType<typeof resolveRawBasis>>>();
  for (const raw of rawProducts) {
    if (!basisMap.has(raw.id)) basisMap.set(raw.id, await resolveRawBasis(raw));
  }

  return lines.map((l) => {
    if (l.lineType === "PROFILE") {
      if (!l.rawProductId) throw new OrderCreateError("PROFILE 行缺原料型材");
      if (!rawMap.has(l.rawProductId)) throw new OrderCreateError(`原料型材不存在或非原料: ${l.rawProductId}`);
      // 第 3 步绑定校验：原料 SKU 已按表面拆分，行表面必须与原料一致，否则扣错桶/假性缺料
      const rawProd = rawMap.get(l.rawProductId)!;
      const mismatch = surfaceMismatch(l, rawProd);
      if (mismatch) throw new OrderCreateError(`行 ${l.sku}：${mismatch}`);
      const length = l.cutLengthMm ?? l.lengthMm;
      if (!length || length <= 0) throw new OrderCreateError("PROFILE 行缺有效切长");
      const basis = basisMap.get(l.rawProductId);
      // D2/D3：按行工序码计价（加工费=Σ工序价，连接件+组装仅勾 EM 才收）；无工序码回退固定费
      const codes: string[] | undefined = Array.isArray(l.processCodes) && l.processCodes.length > 0 ? l.processCodes : undefined;
      const pricing = calcPricing(length, dealer.priceLevel as "A" | "B" | "C", pricingConfig, discountRates, basis, codes ? { codes, prices: opPrices ?? {} } : undefined);
      // 口径切换：下单冻结成本构成，利润页不再随参数/批次价漂移
      const costSnapshot = JSON.stringify({
        source: pricing.costSource,
        perMeterPrice: pricing.perMeterPrice,
        meterWeight: pricing.meterWeight,
        yieldRate: pricing.yieldRate,
        unitCost: pricing.totalCost,
        cutLengthMm: length,
        processCodes: codes ?? [],
        processingCost: pricing.processingCost,
        connectorCost: pricing.connectorCost,
        pricedAt: new Date().toISOString(),
      });
      return { ...l, unitPrice: pricing.dealerPrice, costSnapshot };
    }
    if (l.lineType === "HARDWARE") {
      if (!l.productId) throw new OrderCreateError("HARDWARE 行缺 productId");
      const prod = hwMap.get(l.productId);
      if (!prod) throw new OrderCreateError(`HARDWARE 产品不存在: ${l.productId}`);
      if (prod.drawingRequired && !l.drawingUrl) throw new OrderCreateError(`${prod.sku} 需上传图纸`);
      const unitPrice = Math.round(Number(prod.retailPrice) * discount * 100) / 100;
      return { ...l, sku: prod.sku, productName: prod.productName, spec: prod.spec ?? null, unitPrice };
    }
    return l;
  });
}

/**
 * 内部单自动派单（从 POST 下沉）：唯一活跃车间 + 交期产能校准 + 缺料提示 + 工单/事件/状态事务写。
 * 返回 null 表示无可产出行（不派单）；抛 OrderCreateError 表示缺活跃车间等硬错误。
 */
export async function autoDispatchInternalOrder(
  db: Db,
  opts: {
    orderNo: string;
    lines: Array<{ lineType: string; rawProductId: string | null }>;
    targetDeliveryDate: Date;
    operator: { id: string; name: string | null };
  },
): Promise<{ workOrderNo: string; dispatchWarning: string | null } | null> {
  const { orderNo, lines, targetDeliveryDate, operator } = opts;
  const producible = lines.some((l) => l.lineType !== "OUTSOURCED");
  if (!producible) return null;
  const workshop = await db.workshop.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  if (!workshop) throw new OrderCreateError("没有活跃车间，无法自动派单（订单已创建，请手动派单）");

  // 交期校准：客户要求早于产能建议 → 承诺自动上调到建议值（内部单即车间自己承诺，系统兜住现实）
  const rawIds = [...new Set(lines.filter((l) => l.rawProductId).map((l) => l.rawProductId!))];
  const [load, skuStats, globalStats] = await Promise.all([
    queueLoad(),
    rawIds.length ? skuCycleStats(rawIds) : Promise.resolve(new Map()),
    globalCycleStats(),
  ]);
  const skuStat = rawIds.length === 1 ? (skuStats.get(rawIds[0]) ?? null) : (skuStats.size ? [...skuStats.values()][0] : null);
  const suggestion = suggestDeliveryDays(skuStat ?? globalStats, load, targetDeliveryDate);
  const suggestedDate = new Date(Date.now() + suggestion.days * 86400000);
  const committed = targetDeliveryDate < suggestedDate ? suggestedDate : targetDeliveryDate;
  let dispatchWarning: string | null = null;
  if (committed > targetDeliveryDate) {
    dispatchWarning = `承诺交期已按产能校准：${targetDeliveryDate.toLocaleDateString("zh-CN")} → ${committed.toLocaleDateString("zh-CN")}（${suggestion.basis}）`;
  }

  // 缺料提示（不阻塞快速建单；开工处有硬校验）
  const shortages = await getMaterialShortages(db, orderNo, workshop.id);
  const noteParts = ["内部代下单自动派单"];
  if (shortages.length) {
    noteParts.push(`【缺料提示】${formatShortages(shortages)}`);
    dispatchWarning = `${dispatchWarning ? dispatchWarning + "；" : ""}库存不足：${formatShortages(shortages)}（开工时将再校验）`;
  }

  const workOrderNo = genWorkOrderNo();
  await (db as PrismaClient).$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.workOrder.create({
      data: {
        workOrderNo,
        orderNo,
        workshopId: workshop.id,
        status: "PENDING_START",
        committedDeliveryDate: committed,
        committedOverrideReason: null,
        qcRequired: false,
        currentNote: noteParts.join(" · "),
        assignedBy: operator.name,
      },
    });
    await tx.workOrderEvent.create({
      data: {
        workOrderId: (await tx.workOrder.findUniqueOrThrow({ where: { workOrderNo } })).id,
        fromStatus: null,
        toStatus: "PENDING_START",
        note: `内部代下单自动派发至 ${workshop.name}${dispatchWarning ? "；" + dispatchWarning : ""}`,
        operatorUserId: operator.id,
        operatorName: operator.name,
      },
    });
    await tx.salesOrder.update({ where: { orderNo }, data: { orderStatus: "PRODUCING" } });
  });
  return { workOrderNo, dispatchWarning };
}

/** 下单即示缺料（全网可用量=现存−未结工单占用，排除本单自身工单防漏报）；仅内部单调用，经销商不下发数字 */
export async function materialShortageWarning(orderNo: string): Promise<string | null> {
  const required = await aggregateOrderRequirements(prisma, orderNo);
  const { totalBySku } = await getAvailability(prisma, { excludeOrderNos: [orderNo] });
  const lacking: string[] = [];
  for (const [sku, item] of required.entries()) {
    const avail = totalBySku.get(sku);
    if (!avail || avail.available < item.quantity) {
      lacking.push(`${sku} 需 ${item.quantity}，全网可用 ${avail?.available ?? 0}（现存 ${avail?.onHand ?? 0} − 占用 ${avail?.allocated ?? 0}）`);
    }
  }
  return lacking.length > 0 ? `原料可用量不足：${lacking.join("；")}` : null;
}

/** 门户单关联 CRM 的后置动作：客户阶段推进 + 联系日志留痕 */
export async function crmTraceAfterCreate(
  dealerId: string,
  crmCustomerId: string,
  crmOpportunityId: string | null | undefined,
  orderNo: string,
  totalAmount: number,
  operatorName: string | null,
): Promise<void> {
  await prisma.crmCustomer.update({
    where: { id: crmCustomerId },
    data: { stage: "QUOTED", lastContactAt: new Date() },
  });
  await prisma.crmContactLog.create({
    data: {
      dealerId,
      customerId: crmCustomerId,
      opportunityId: crmOpportunityId ?? null,
      method: "OTHER",
      content: `已创建报价/订单草稿 ${orderNo}，金额 ${totalAmount.toFixed(2)}`,
      outcome: "已生成报价",
      createdBy: operatorName,
    },
  });
}

/** 内部单飞书通知（无 WEBHOOK_URL 时静默跳过） */
export function notifyInternalOrderCreated(
  displayOrderNo: string,
  dealerName: string,
  targetDeliveryDate: Date,
  lines: Array<{ sku: string; cutLengthMm: number | null; quantity: number }>,
): void {
  void notifyFeishu("新加工单", [
    `单号 ${displayOrderNo}`,
    `客户 ${dealerName.slice(0, 16)}`,
    `交期 ${targetDeliveryDate.toLocaleDateString("zh-CN")}`,
    ...lines.slice(0, 8).map((l) => `${l.sku}${l.cutLengthMm ? " " + l.cutLengthMm + "mm" : ""} ×${l.quantity}`),
    ...(lines.length > 8 ? [`…共 ${lines.length} 行`] : []),
  ]);
}
