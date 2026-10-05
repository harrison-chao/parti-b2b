import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { applyStockMovement } from "@/lib/inventory";
import { generateProductSku } from "@/lib/sku";
import { barsFor } from "@/lib/stock-consume";

const returnSchema = z.object({
  returns: z.array(z.object({
    sourceSku: z.string().min(1),   // 被消耗的整棒原料 SKU
    segmentMm: z.number().int().min(50),  // 余段长度
    quantity: z.number().int().min(1),    // 余段根数
  })).min(1),
  note: z.string().optional().nullable(),
});

async function loadCtx(workOrderNo: string) {
  const wo = await prisma.workOrder.findUnique({
    where: { workOrderNo },
    include: { order: { include: { lines: true } } },
  });
  return wo;
}

/** GET：该工单的余段回库建议（理论余量 = 扣棒数×棒长 − 切长合计，+5% 锯口宽放）与已回库记录 */
export async function GET(_req: NextRequest, { params }: { params: { workOrderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const wo = await loadCtx(params.workOrderNo);
  if (!wo) return fail("工单不存在", 404, 404);
  if (session.user.role === "WORKSHOP" && session.user.workshopId !== wo.workshopId) {
    return fail("无权查看该工单", 403, 403);
  }

  // 按 rawProductId 聚合切长（与扣料同口径：SEMI 按件折段不产生新余段）
  const rawAgg = new Map<string, { sku: string; productName: string; totalMm: number; lengthMm: number | null }>();
  for (const l of wo.order.lines) {
    if (l.lineType !== "PROFILE" || !l.rawProductId || !l.cutLengthMm) continue;
    const product = await prisma.product.findUnique({ where: { id: l.rawProductId } });
    if (!product || product.materialStage === "SEMI") continue;
    const e = rawAgg.get(product.id) ?? { sku: product.sku, productName: product.productName, totalMm: 0, lengthMm: product.lengthMm != null ? Number(product.lengthMm) : null };
    e.totalMm += l.cutLengthMm * l.quantity;
    rawAgg.set(product.id, e);
  }
  const consumed = await prisma.stockMovement.findMany({
    where: { refType: "WO", refNo: wo.workOrderNo, type: "WORK_ORDER_CONSUME" },
    select: { sku: true, quantity: true, note: true },
  });
  const suggestions = [...rawAgg.values()].map((e) => {
    const bars = consumed.find((c) => c.sku === e.sku) ? Math.abs(consumed.find((c) => c.sku === e.sku)!.quantity) : barsFor(e.totalMm, { lengthMm: e.lengthMm, yieldRate: null }).bars;
    const remainderMm = bars * (e.lengthMm ?? 3600) - e.totalMm;
    return {
      sourceSku: e.sku, productName: e.productName, barMm: e.lengthMm ?? 3600,
      totalCutMm: e.totalMm, barsConsumed: bars,
      // 理论可回库余量上限 = 余段 + 5% 锯口损耗宽放
      maxReturnMm: Math.max(0, Math.round(remainderMm + e.totalMm * 0.05)),
      remainderMm: Math.max(0, remainderMm),
    };
  });

  const history = await prisma.stockMovement.findMany({
    where: { refType: "WO_RETURN", refNo: wo.workOrderNo, type: "PRODUCTION_RETURN" },
    orderBy: { createdAt: "desc" },
  });
  return ok({ suggestions, history });
}

/**
 * POST：余段回库——把切割剩余段按 SEMI 半成品入库（自动建/找段长档案）。
 * 幂等上限：该工单该源 SKU 累计回库米数不得超过 理论余量+5% 宽放，防误录放大库存。
 */
export async function POST(req: NextRequest, { params }: { params: { workOrderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const wo = await loadCtx(params.workOrderNo);
  if (!wo) return fail("工单不存在", 404, 404);
  if (session.user.role === "WORKSHOP" && session.user.workshopId !== wo.workshopId) {
    return fail("无权操作该工单", 403, 403);
  }
  const parsed = returnSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  // 余段回库以领料为前提：未开工的工单没有余段（与前端按钮禁用同规则）
  if (!["PROCESSING", "OUTSOURCING", "QC", "PACKING", "READY_TO_SHIP", "SHIPPED"].includes(wo.status)) {
    return fail(`工单状态 ${wo.status} 尚未领料，暂无余段可回`, 409, 409);
  }

  try {
    const created: Array<{ sku: string; segmentMm: number; quantity: number }> = [];
    await prisma.$transaction(async (tx) => {
      for (const item of d.returns) {
        const source = await tx.product.findUnique({ where: { sku: item.sourceSku } });
        if (!source || !source.isRawMaterial) throw new Error(`源原料不存在或非原料：${item.sourceSku}`);
        if (source.materialStage === "SEMI") throw new Error(`${item.sourceSku} 是半成品段，无余段概念`);
        const barMm = source.lengthMm != null ? Number(source.lengthMm) : 3600;
        if (item.segmentMm >= barMm) throw new Error(`余段长 ${item.segmentMm}mm 不小于棒长 ${barMm}mm，请核对`);

        // 上限校验：累计回库 ≤ 理论余量 + 5% 宽放
        const prior = await tx.stockMovement.findMany({
          where: { refType: "WO_RETURN", refNo: wo.workOrderNo, type: "PRODUCTION_RETURN", sku: { startsWith: `SEMI-` }, note: { contains: item.sourceSku } },
          select: { quantity: true, note: true },
        });
        // prior 记录的 note 形如 "余段回库 ← {sourceSku} · 段长 xxx"，从产品档案取段长算米数
        let priorMm = 0;
        for (const p of prior) {
          const m = /段长 (\d+)/.exec(p.note ?? "");
          priorMm += (m ? parseInt(m[1], 10) : 0) * p.quantity;
        }
        const { lines } = wo.order;
        let totalCutMm = 0;
        for (const l of lines) {
          if (l.lineType === "PROFILE" && l.rawProductId === source.id && l.cutLengthMm) totalCutMm += l.cutLengthMm * l.quantity;
        }
        const consumedRow = await tx.stockMovement.findFirst({
          where: { refType: "WO", refNo: wo.workOrderNo, type: "WORK_ORDER_CONSUME", sku: item.sourceSku },
          select: { quantity: true },
        });
        const bars = consumedRow ? Math.abs(consumedRow.quantity) : barsFor(totalCutMm, source).bars;
        const maxMm = Math.max(0, Math.round(bars * barMm - totalCutMm + totalCutMm * 0.05));
        if (priorMm + item.segmentMm * item.quantity > maxMm) {
          throw new Error(`${item.sourceSku} 累计回库将超理论余量上限（已回 ${priorMm}mm + 本次 ${item.segmentMm * item.quantity}mm > 上限 ${maxMm}mm），请核对实测段长`);
        }

        // 自动建/找 SEMI 段长档案：同系列+同表面+同段长 复用
        let semi = await tx.product.findFirst({
          where: {
            sku: { startsWith: "SEMI-" },
            series: source.series,
            lengthMm: item.segmentMm,
            surfaceProcessCode: source.surfaceProcessCode,
            surfaceColorCode: source.surfaceColorCode,
          },
        });
        if (!semi) {
          const sku = await generateProductSku(tx, {
            category: "PROFILE",
            series: source.series ?? "",
            isRawMaterial: true,
            materialStage: "SEMI",
            surfaceProcessCode: source.surfaceProcessCode,
            surfaceColorCode: source.surfaceColorCode,
            lengthMm: item.segmentMm,
          });
          semi = await tx.product.create({
            data: {
              sku,
              productName: `${source.series ?? ""} 余段 ${item.segmentMm}mm`,
              category: "PROFILE",
              series: source.series ?? "",
              isRawMaterial: true,
              materialStage: "SEMI",
              lengthMm: item.segmentMm,
              surfaceProcessCode: source.surfaceProcessCode,
              surfaceColorCode: source.surfaceColorCode,
              weightPerMeter: source.weightPerMeter,
              yieldRate: source.yieldRate,
              // 段价按长度比例折算档案采购价，仅作兜底显示；真实成本走每米均价
              ...(source.purchasePrice != null
                ? { purchasePrice: Math.round(Number(source.purchasePrice) * (item.segmentMm / barMm) * 100) / 100 }
                : {}),
              // retailPrice 非空列：按长度比例折算，缺档案价时置 0（真实成本走每米均价）
              retailPrice: source.retailPrice != null
                ? Math.round(Number(source.retailPrice) * (item.segmentMm / barMm) * 100) / 100
                : 0,
              unit: source.unit,
              isActive: true,
            },
          });
        }

        const srcInv = await tx.workshopInventory.findUnique({
          where: { workshopId_sku: { workshopId: wo.workshopId, sku: item.sourceSku } },
        });
        const perMeter = srcInv?.avgCostPerMeter != null ? Number(srcInv.avgCostPerMeter) : null;
        await applyStockMovement(tx, {
          workshopId: wo.workshopId,
          sku: semi.sku, productName: semi.productName,
          delta: item.quantity, type: "PRODUCTION_RETURN",
          refType: "WO_RETURN", refNo: wo.workOrderNo,
          unitCost: perMeter, avgCostPerMeter: perMeter,
          note: `余段回库 ← ${item.sourceSku} · 段长 ${item.segmentMm}mm${d.note ? ` · ${d.note}` : ""}`,
          operatorName: session.user?.name ?? null,
        });
        created.push({ sku: semi.sku, segmentMm: item.segmentMm, quantity: item.quantity });
      }
    });
    await logAudit({
      action: "PRODUCTION_RETURN", entityType: "WorkOrder", entityId: wo.workOrderNo,
      summary: `工单 ${wo.workOrderNo} 余段回库：${created.map((c) => `${c.sku} ×${c.quantity}`).join("、")}`,
      detail: { returns: created }, actor: session.user,
    });
    return ok({ created });
  } catch (e: any) {
    return fail(e?.message ?? "回库失败", 409, 409);
  }
}
