import type { Prisma, PrismaClient, WorkOrderStatus } from "@prisma/client";
import { aggregateOrderRequirements, barsFor, semiSegmentsFor } from "@/lib/stock-consume";

type Tx = Prisma.TransactionClient | PrismaClient;
type Db = PrismaClient;

/** 未结工单（未发货/未取消）= 占用源；扣过料的（有 WORK_ORDER_CONSUME 流水）不再占用 */
export const OPEN_WO_STATUSES = [
  "PENDING_START", "PROCESSING", "OUTSOURCING", "QC", "PACKING", "READY_TO_SHIP",
] as const;

export type Allocations = {
  /** sku → 占用数量（未结且未扣料的工单需求合计） */
  bySku: Map<string, number>;
  /** 外协在途：工单状态 OUTSOURCING 的占用，按车间展开 */
  outsourced: Array<{ workshopId: string; workshopName: string; workOrderNo: string; orderNo: string; sku: string; productName: string; quantity: number }>;
};

/** 与 aggregateProfileLines 完全同口径（barsFor/semiSegmentsFor），但按 orderNos 批量预取后内存聚合 */
function aggregateBatch(
  lines: Array<{ orderNo: string; lineType: string; sku: string; productName: string; rawProductId: string | null; cutLengthMm: number | null; quantity: number }>,
  productMap: Map<string, { id: string; sku: string; productName: string; materialStage: string | null; lengthMm: unknown; yieldRate: unknown }>,
): Map<string, Map<string, { productName: string; quantity: number }>> {
  // orderNo → sku → 需求量
  const byOrder = new Map<string, Map<string, { productName: string; quantity: number }>>();
  for (const l of lines) {
    const order = byOrder.get(l.orderNo) ?? new Map<string, { productName: string; quantity: number }>();
    byOrder.set(l.orderNo, order);
    if (l.lineType === "HARDWARE") {
      const e = order.get(l.sku) ?? { productName: l.productName, quantity: 0 };
      e.quantity += l.quantity;
      order.set(l.sku, e);
    } else if (l.lineType === "PROFILE" && l.rawProductId && l.cutLengthMm) {
      const product = productMap.get(l.rawProductId);
      if (!product) continue;
      const e = order.get(product.sku) ?? { productName: product.productName, quantity: 0 };
      if (product.materialStage === "SEMI") {
        const barMm = product.lengthMm != null ? Number(product.lengthMm) : 0;
        e.quantity += barMm > 0 ? semiSegmentsFor(barMm, l.cutLengthMm, l.quantity) : l.quantity;
      } else {
        e.quantity += barsFor(l.cutLengthMm * l.quantity, product).bars;
      }
      order.set(product.sku, e);
    }
  }
  return byOrder;
}

/**
 * 指定状态工单的用料占用（未扣料的才占用），批量实现：
 * 1 条 groupBy 拿已扣料工单集合 + 1 条工单 + 1 条订单行 + 1 条产品 = 4 条查询，替代逐单 3N。
 */
export async function allocationsByStatuses(
  db: Db,
  statuses: readonly WorkOrderStatus[],
  opts?: { excludeOrderNos?: string[] },
): Promise<{
  allocations: Allocations;
  /** workshopId|sku → 占用（与 allocations.bySku 同口径，按车间展开） */
  byWsSku: Map<string, number>;
}> {
  const exclude = new Set(opts?.excludeOrderNos ?? []);
  const [consumedGroups, wos] = await Promise.all([
    db.stockMovement.groupBy({ by: ["refNo"], where: { refType: "WO", type: "WORK_ORDER_CONSUME" }, _count: { refNo: true } }),
    db.workOrder.findMany({
      where: { status: { in: [...statuses] } },
      include: { workshop: { select: { id: true, name: true } } },
    }),
  ]);
  const consumedWoNos = new Set(consumedGroups.map((g) => g.refNo));
  const active = wos.filter((wo) => !consumedWoNos.has(wo.workOrderNo) && !exclude.has(wo.orderNo));
  const orderNos = [...new Set(active.map((wo) => wo.orderNo))];

  const [lines, products] = await Promise.all([
    orderNos.length
      ? db.salesOrderLine.findMany({
          where: { orderNo: { in: orderNos }, lineType: { not: "OUTSOURCED" } },
          select: { orderNo: true, lineType: true, sku: true, productName: true, rawProductId: true, cutLengthMm: true, quantity: true },
        })
      : Promise.resolve([]),
    db.product.findMany({ select: { id: true, sku: true, productName: true, materialStage: true, lengthMm: true, yieldRate: true } }),
  ]);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const byOrder = aggregateBatch(lines, productMap);

  const bySku = new Map<string, number>();
  const byWsSku = new Map<string, number>();
  const outsourced: Allocations["outsourced"] = [];
  for (const wo of active) {
    const order = byOrder.get(wo.orderNo);
    if (!order) continue;
    for (const [sku, item] of order.entries()) {
      bySku.set(sku, (bySku.get(sku) ?? 0) + item.quantity);
      byWsSku.set(`${wo.workshopId}|${sku}`, (byWsSku.get(`${wo.workshopId}|${sku}`) ?? 0) + item.quantity);
      if (wo.status === "OUTSOURCING") {
        outsourced.push({
          workshopId: wo.workshopId, workshopName: wo.workshop.name,
          workOrderNo: wo.workOrderNo, orderNo: wo.orderNo,
          sku, productName: item.productName, quantity: item.quantity,
        });
      }
    }
  }
  return { allocations: { bySku, outsourced }, byWsSku };
}

/** 未结工单用料占用（语义糖：全开放状态） */
export async function getAllocations(db: Db): Promise<Allocations> {
  return (await allocationsByStatuses(db, OPEN_WO_STATUSES)).allocations;
}

export type AvailabilityRow = {
  workshopId: string; workshopName: string; sku: string; productName: string;
  onHand: number; allocatedHere: number; availableHere: number;
};

/** 全网可用量 = Σ各车间现存 − Σ未结工单占用；excludeOrderNos 用于下单自检时排除本单（否则本单工单吃掉自己的告警） */
export async function getAvailability(db: Db, opts?: { excludeOrderNos?: string[]; statuses?: readonly WorkOrderStatus[] }): Promise<{
  totalBySku: Map<string, { onHand: number; allocated: number; available: number }>;
  rows: AvailabilityRow[];
  allocations: Allocations;
  byWsSku: Map<string, number>;
}> {
  const statuses = opts?.statuses ?? OPEN_WO_STATUSES;
  const [inv, { allocations, byWsSku }, workshops] = await Promise.all([
    db.workshopInventory.findMany({ select: { workshopId: true, sku: true, productName: true, quantity: true } }),
    allocationsByStatuses(db, statuses, { excludeOrderNos: opts?.excludeOrderNos }),
    db.workshop.findMany({ select: { id: true, name: true } }),
  ]);
  const wsName = new Map(workshops.map((w) => [w.id, w.name]));

  const totalBySku = new Map<string, { onHand: number; allocated: number; available: number }>();
  for (const row of inv) {
    const t = totalBySku.get(row.sku) ?? { onHand: 0, allocated: 0, available: 0 };
    t.onHand += row.quantity;
    totalBySku.set(row.sku, t);
  }
  for (const [sku, qty] of allocations.bySku) {
    const t = totalBySku.get(sku);
    if (t) t.allocated += qty;
  }
  for (const t of totalBySku.values()) t.available = t.onHand - t.allocated;

  const rows: AvailabilityRow[] = inv.map((row) => {
    const allocatedHere = byWsSku.get(`${row.workshopId}|${row.sku}`) ?? 0;
    return {
      workshopId: row.workshopId, workshopName: wsName.get(row.workshopId) ?? row.workshopId,
      sku: row.sku, productName: row.productName,
      onHand: row.quantity, allocatedHere, availableHere: row.quantity - allocatedHere,
    };
  });
  return { totalBySku, rows, allocations, byWsSku };
}

// ── 库存估值 ─────────────────────────────────────────────
export type ValuationRow = {
  workshopName: string; sku: string; productName: string;
  quantity: number; metersPerUnit: number | null;
  avgCostPerMeter: number | null; unitCostFallback: number | null;
  unitValue: number; amount: number;
};

/** 单件价值：型材 = 每米均价×棒长(米)（缺均价回退档案采购价），五金 = 档案采购价。数值字段宽松接受 Decimal/字符串 */
export function unitValueOf(
  inv: { sku: string; avgCostPerMeter?: unknown },
  product: {
    category?: string | null; isRawMaterial?: boolean | null; lengthMm?: unknown; purchasePrice?: unknown;
  } | null | undefined,
): { unitValue: number; metersPerUnit: number | null } {
  if (!product) return { unitValue: 0, metersPerUnit: null };
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  const avg = num(inv.avgCostPerMeter);
  const purchase = num(product.purchasePrice);
  if (product.category === "PROFILE" || product.isRawMaterial) {
    const lengthMm = num(product.lengthMm);
    const meters = lengthMm != null ? lengthMm / 1000 : null;
    if (avg != null && meters != null) return { unitValue: round2(avg * meters), metersPerUnit: meters };
    return { unitValue: purchase ?? 0, metersPerUnit: meters };
  }
  return { unitValue: purchase ?? 0, metersPerUnit: null };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

export async function getValuation(db: Db): Promise<{
  rows: ValuationRow[]; byWorkshop: Array<{ workshopName: string; amount: number }>; total: number;
}> {
  const [inv, products] = await Promise.all([
    db.workshopInventory.findMany({
      where: { quantity: { gt: 0 } },
      include: { workshop: { select: { name: true } } },
      orderBy: [{ workshop: { name: "asc" } }, { sku: "asc" }],
    }),
    db.product.findMany({ select: { sku: true, category: true, isRawMaterial: true, lengthMm: true, purchasePrice: true } }),
  ]);
  const pMap = new Map(products.map((p) => [p.sku, p]));
  const rows: ValuationRow[] = [];
  const byWs = new Map<string, number>();
  for (const row of inv) {
    const product = pMap.get(row.sku);
    const { unitValue, metersPerUnit } = unitValueOf(row, product);
    const amount = round2(unitValue * row.quantity);
    rows.push({
      workshopName: row.workshop.name, sku: row.sku, productName: row.productName,
      quantity: row.quantity, metersPerUnit,
      avgCostPerMeter: row.avgCostPerMeter != null ? Number(row.avgCostPerMeter) : null,
      unitCostFallback: product?.purchasePrice != null ? Number(product.purchasePrice) : null,
      unitValue, amount,
    });
    byWs.set(row.workshop.name, (byWs.get(row.workshop.name) ?? 0) + amount);
  }
  return {
    rows,
    byWorkshop: [...byWs.entries()].map(([workshopName, amount]) => ({ workshopName, amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
    total: round2(rows.reduce((s, r) => s + r.amount, 0)),
  };
}

// ── 收发存汇总 ───────────────────────────────────────────
export type PeriodRow = {
  sku: string; productName: string;
  opening: number; received: number; issued: number; closing: number;
  receivedPo: number; receivedReturn: number; receivedTransfer: number; receivedAdjust: number;
  issuedConsume: number; issuedTransfer: number; issuedAdjust: number;
};

/** 期初 = 当前合计 − 期间净变动；期间按 [from, to) 聚合流水 */
export async function getPeriodSummary(db: Db, from: Date, to: Date): Promise<PeriodRow[]> {
  const [inv, movements] = await Promise.all([
    db.workshopInventory.groupBy({ by: ["sku"], _sum: { quantity: true } }),
    db.stockMovement.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { sku: true, productName: true, quantity: true, type: true } }),
  ]);
  const current = new Map(inv.map((g) => [g.sku, g._sum.quantity ?? 0]));
  const acc = new Map<string, PeriodRow>();
  const ensure = (sku: string, productName: string) => {
    let r = acc.get(sku);
    if (!r) {
      r = { sku, productName, opening: 0, received: 0, issued: 0, closing: 0,
        receivedPo: 0, receivedReturn: 0, receivedTransfer: 0, receivedAdjust: 0,
        issuedConsume: 0, issuedTransfer: 0, issuedAdjust: 0 };
      acc.set(sku, r);
    }
    return r;
  };
  // 先放只有期末库存、期间无流水的 SKU
  for (const [sku, qty] of current) if (qty > 0) ensure(sku, sku);
  for (const m of movements) {
    const r = ensure(m.sku, m.productName);
    if (m.quantity > 0) {
      r.received += m.quantity;
      if (m.type === "PO_RECEIPT") r.receivedPo += m.quantity;
      else if (m.type === "PRODUCTION_RETURN") r.receivedReturn += m.quantity;
      else if (m.type === "TRANSFER_IN") r.receivedTransfer += m.quantity;
      else r.receivedAdjust += m.quantity;
    } else {
      r.issued += -m.quantity;
      if (m.type === "WORK_ORDER_CONSUME") r.issuedConsume += -m.quantity;
      else if (m.type === "TRANSFER_OUT") r.issuedTransfer += -m.quantity;
      else r.issuedAdjust += -m.quantity;
    }
  }
  const rows: PeriodRow[] = [];
  for (const r of acc.values()) {
    const closing = current.get(r.sku) ?? 0;
    // 期间无流水的 SKU：期初=期末；有流水的：期初 = 期末 − 净变动
    const moved = movements.filter((m) => m.sku === r.sku).reduce((s, m) => s + m.quantity, 0);
    rows.push({ ...r, opening: closing - moved, closing });
  }
  return rows.sort((a, b) => b.closing - a.closing);
}

// ── 动态补货建议 ─────────────────────────────────────────
export type ReorderRow = {
  sku: string; productName: string; onHand: number; allocated: number; available: number;
  dailyUse: number; leadDays: number; target: number; suggest: number;
};

/** 补货点 = 近30天日均消耗 × (供应商交期 + 3天安全) ；建议采购 = 补货点 − 可用量（负数归 0） */
export async function getReorderSuggestions(db: Db, opts?: { windowDays?: number; safetyDays?: number }): Promise<ReorderRow[]> {
  const windowDays = opts?.windowDays ?? 30;
  const safetyDays = opts?.safetyDays ?? 3;
  const since = new Date(Date.now() - windowDays * 86400_000);
  const [consumption, availability, raws, poLines] = await Promise.all([
    db.stockMovement.groupBy({ by: ["sku"], where: { type: "WORK_ORDER_CONSUME", createdAt: { gte: since } }, _sum: { quantity: true } }),
    getAvailability(db),
    db.product.findMany({ where: { isRawMaterial: true, isActive: true }, select: { sku: true, productName: true } }),
    db.purchaseOrderLine.findMany({
      select: { sku: true, po: { select: { supplierId: true, createdAt: true, supplier: { select: { defaultLeadTimeDays: true } } } } },
      orderBy: { po: { createdAt: "asc" } },
    }),
  ]);
  const useMap = new Map(consumption.map((g) => [g.sku, -(g._sum.quantity ?? 0)]));
  const leadMap = new Map<string, number>();
  for (const l of poLines) {
    if (l.sku && l.po?.supplier) leadMap.set(l.sku, l.po.supplier.defaultLeadTimeDays || 7);
  }
  const rows: ReorderRow[] = [];
  for (const raw of raws) {
    const used = useMap.get(raw.sku) ?? 0;
    const avail = availability.totalBySku.get(raw.sku) ?? { onHand: 0, allocated: 0, available: 0 };
    if (used === 0 && avail.available > 0) continue; // 无消耗且不缺料：不产生噪音
    const dailyUse = Math.round((used / windowDays) * 100) / 100;
    const leadDays = leadMap.get(raw.sku) ?? 7;
    const target = Math.ceil(dailyUse * (leadDays + safetyDays));
    const suggest = Math.max(0, target - avail.available);
    rows.push({ sku: raw.sku, productName: raw.productName, onHand: avail.onHand, allocated: avail.allocated, available: avail.available, dailyUse, leadDays, target, suggest });
  }
  return rows.sort((a, b) => b.suggest - a.suggest || b.dailyUse - a.dailyUse);
}

// ── 库龄 / 呆滞 ─────────────────────────────────────────
export type AgingRow = { workshopName: string; sku: string; productName: string; quantity: number; lastMovedAt: Date; idleDays: number };

export async function getAging(db: Db, thresholdDays = 90): Promise<AgingRow[]> {
  const [inv, lastMoves] = await Promise.all([
    db.workshopInventory.findMany({ where: { quantity: { gt: 0 } }, include: { workshop: { select: { name: true } } } }),
    db.stockMovement.groupBy({ by: ["workshopId", "sku"], _max: { createdAt: true } }),
  ]);
  const lastMap = new Map(lastMoves.map((g) => [`${g.workshopId}|${g.sku}`, g._max.createdAt ?? new Date()]));
  const now = Date.now();
  return inv
    .map((row) => {
      const last = lastMap.get(`${row.workshopId}|${row.sku}`) ?? new Date(row.updatedAt);
      return { workshopName: row.workshop.name, sku: row.sku, productName: row.productName, quantity: row.quantity, lastMovedAt: last, idleDays: Math.floor((now - last.getTime()) / 86400_000) };
    })
    .filter((r) => r.idleDays >= thresholdDays)
    .sort((a, b) => b.idleDays - a.idleDays);
}

// ── ABC 分类与盘点计划 ───────────────────────────────────
export type AbcRow = {
  sku: string; productName: string; value90d: number; share: number; cumulative: number;
  klass: "A" | "B" | "C"; cadenceDays: number; lastCountedAt: Date | null; nextDueAt: Date;
};

/** 近90天消耗价值 ABC：累计 ≤70% 为 A（月盘）、≤90% 为 B（季盘）、其余 C（半年盘）；下次应盘日 = 上次盘点批准日 + 周期 */
export async function getAbcClassification(db: Db): Promise<AbcRow[]> {
  const since = new Date(Date.now() - 90 * 86400_000);
  const [movements, products, counts] = await Promise.all([
    db.stockMovement.findMany({
      where: { type: "WORK_ORDER_CONSUME", createdAt: { gte: since } },
      select: { sku: true, productName: true, quantity: true, unitCost: true },
    }),
    db.product.findMany({ select: { sku: true, category: true, isRawMaterial: true, lengthMm: true, purchasePrice: true } }),
    db.stockCount.findMany({
      where: { status: "APPROVED", approvedAt: { not: null } },
      select: { approvedAt: true, lines: { select: { sku: true } } },
      orderBy: { approvedAt: "desc" },
    }),
  ]);
  const pMap = new Map(products.map((p) => [p.sku, p]));
  const valueBySku = new Map<string, { productName: string; value: number }>();
  for (const m of movements) {
    const product = pMap.get(m.sku);
    const { unitValue } = unitValueOf({ sku: m.sku, avgCostPerMeter: m.unitCost }, product);
    const v = Math.abs(m.quantity) * (unitValue || Number(product?.purchasePrice ?? 0));
    const e = valueBySku.get(m.sku) ?? { productName: m.productName, value: 0 };
    e.value += v;
    valueBySku.set(m.sku, e);
  }
  const lastCounted = new Map<string, Date>();
  for (const c of counts) {
    for (const l of c.lines) {
      if (!lastCounted.has(l.sku) && c.approvedAt) lastCounted.set(l.sku, c.approvedAt);
    }
  }
  const total = [...valueBySku.values()].reduce((s, x) => s + x.value, 0);
  const sorted = [...valueBySku.entries()].sort((a, b) => b[1].value - a[1].value);
  let cum = 0;
  return sorted.map(([sku, e], i) => {
    const share = total > 0 ? e.value / total : 0;
    // 判档用累加前的累计（首项占比再大也是 A），防单一主耗 SKU 被打到 B/C
    const klass: "A" | "B" | "C" = i === 0 || cum <= 0.7 ? "A" : cum <= 0.9 ? "B" : "C";
    cum += share;
    const cadenceDays = klass === "A" ? 30 : klass === "B" ? 90 : 180;
    const lastCountedAt = lastCounted.get(sku) ?? null;
    const base = lastCountedAt ?? new Date();
    return {
      sku, productName: e.productName,
      value90d: round2(e.value), share: Math.round(share * 1000) / 10, cumulative: Math.round(cum * 1000) / 10,
      klass, cadenceDays, lastCountedAt,
      // 从未盘过的立即应盘；盘过的按周期推下次应盘日（已过期则显示为过去日期，一眼看出超期）
      nextDueAt: lastCountedAt ? new Date(base.getTime() + cadenceDays * 86400_000) : new Date(),
    };
  });
}
