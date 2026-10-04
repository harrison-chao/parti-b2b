import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * 交期承诺辅助（P1-A）。
 * 校准依据（2026-10 生产库 124 单实测）：实际周期 P50=4d / P90=16d / P95=28d；
 * 客户要求 P50=1d（24.6% 要求日期早于下单日）→ 历史 89.2% 逾期。
 * 口径备注：orderDate→actualDeliveryDate（含审单等待），P90 偏保守——用于承诺安全侧。
 */

export type QueueLoad = {
  inProduction: number;   // 未完工工单（待开工~待发货）
  dueIn7d: number;        // 未来 7 天内承诺应交且未发运
  weeklyThroughput: number; // 近 90 天平均周发货量
};

export async function queueLoad(): Promise<QueueLoad> {
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const [inProduction, dueIn7d, shipped90d] = await Promise.all([
    prisma.workOrder.count({
      where: { status: { in: ["PENDING_START", "PROCESSING", "OUTSOURCING", "QC", "PACKING", "READY_TO_SHIP"] } },
    }),
    prisma.workOrder.count({
      where: {
        status: { in: ["PENDING_START", "PROCESSING", "OUTSOURCING", "QC", "PACKING", "READY_TO_SHIP"] },
        committedDeliveryDate: { gte: now, lte: in7d },
      },
    }),
    prisma.workOrder.count({
      where: { status: "SHIPPED", actualShippedAt: { gte: d90 } },
    }),
  ]);
  return { inProduction, dueIn7d, weeklyThroughput: Math.round((shipped90d / 12) * 10) / 10 };
}

export type SkuCycle = { p50: number; p90: number; sample: number };

/** 同原料 SKU 的历史实际周期分位数（SHIPPED/COMPLETED 且有发货日期；样本 ≥3 才输出） */
export async function skuCycleStats(rawProductIds: string[]): Promise<Map<string, SkuCycle>> {
  if (!rawProductIds.length) return new Map();
  const rows = await prisma.$queryRaw<Array<{ rawProductId: string; p50: Prisma.Decimal; p90: Prisma.Decimal; n: bigint }>>(Prisma.sql`
    SELECT l."rawProductId",
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (o."actualDeliveryDate" - o."orderDate")) / 86400) AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (o."actualDeliveryDate" - o."orderDate")) / 86400) AS p90,
      COUNT(DISTINCT o."orderNo") AS n
    FROM "SalesOrder" o
    JOIN "SalesOrderLine" l ON l."orderNo" = o."orderNo"
    WHERE l."rawProductId" IN (${Prisma.join(rawProductIds)})
      AND o."actualDeliveryDate" IS NOT NULL
      AND o."orderStatus" IN ('SHIPPED', 'COMPLETED')
      AND o."actualDeliveryDate" >= o."orderDate"
    GROUP BY 1
    HAVING COUNT(DISTINCT o."orderNo") >= 3
  `);
  return new Map(rows.map((r) => [r.rawProductId, {
    p50: Math.ceil(Number(r.p50)),
    p90: Math.ceil(Number(r.p90)),
    sample: Number(r.n),
  }]));
}

/** 全局周期（无 SKU 样本时的兜底，同一 SQL 不带 SKU 过滤） */
export async function globalCycleStats(): Promise<SkuCycle | null> {
  const rows = await prisma.$queryRaw<Array<{ p50: Prisma.Decimal; p90: Prisma.Decimal; n: bigint }>>(Prisma.sql`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("actualDeliveryDate" - "orderDate")) / 86400) AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("actualDeliveryDate" - "orderDate")) / 86400) AS p90,
      COUNT(*) AS n
    FROM "SalesOrder"
    WHERE "actualDeliveryDate" IS NOT NULL
      AND "orderStatus" IN ('SHIPPED', 'COMPLETED')
      AND "actualDeliveryDate" >= "orderDate"
  `);
  const r = rows[0];
  if (!r || Number(r.n) < 3) return null;
  return { p50: Math.ceil(Number(r.p50)), p90: Math.ceil(Number(r.p90)), sample: Number(r.n) };
}

/**
 * 建议承诺交期（天数，自今天起）：
 * - 基线 = 该 SKU P90（无样本用全局 P90）
 * - 队列紧（7 天内应交 > 周产能）→ 上浮到 P95≈基线+12（校准：16→28）
 * - 客户要求的日期晚于建议 → 直接采用客户日期（零风险区间）
 * 返回 { days, basis } 供 UI 展示依据。
 */
export function suggestDeliveryDays(
  cycle: SkuCycle | null,
  load: QueueLoad,
  customerDate: Date | null,
): { days: number; basis: string } {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const baseP90 = cycle?.p90 ?? 16; // 校准兜底：全局 P90=16
  let days = baseP90;
  let basis = cycle
    ? `同型材历史周期 P90=${baseP90} 天（样本 ${cycle.sample} 单）`
    : `全厂历史周期 P90=${baseP90} 天（默认校准值）`;
  if (load.dueIn7d > Math.max(load.weeklyThroughput, 1)) {
    days = baseP90 + 12;
    basis += `；未来7天应交 ${load.dueIn7d} 单超周产能 ${load.weeklyThroughput}，上浮至 ${days} 天`;
  }
  if (customerDate) {
    const custDays = Math.ceil((customerDate.getTime() - startOfToday.getTime()) / 86400000);
    if (custDays > days) {
      return { days: custDays, basis: `客户要求 ${custDays} 天后，晚于产能建议（${days} 天），直接采用客户日期` };
    }
  }
  return { days, basis };
}
