import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireRole } from "@/lib/api";
import { applyStockMovement, movingAveragePerMeter, theoreticalWeightKg, weightDeviation, WEIGHT_TOLERANCE } from "@/lib/inventory";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  lines: z.array(z.object({
    lineId: z.string().min(1),
    receiveQty: z.number().int().nonnegative(),
    // 批次计价：本批磅单重量 kg（按重量结算行必填；按根行可填用于磅差校验）
    weightKg: z.number().positive().optional().nullable(),
  })).min(1),
  note: z.string().optional().nullable(),
  // 炉批号：同色不同批有色差风险，收货时录入供追溯与同单同批核对
  batchNo: z.string().optional().nullable(),
  // 磅差超过容忍带时需显式确认（前端弹窗后重发）；确认动作单独留痕
  confirm: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { poNo: string } }) {
  const guard = await requireRole("ADMIN");
  if (guard.response) return guard.response;
  const session = guard.session;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { lines, note, confirm, batchNo } = parsed.data;

  // 原料档案（棒长/米重）与磅差校验可在事务外做（只读）；写路径全部在事务内重读
  const po0 = await prisma.purchaseOrder.findUnique({ where: { poNo: params.poNo }, select: { status: true } });
  if (!po0) return fail("采购单不存在", 404, 404);
  if (po0.status === "CANCELLED" || po0.status === "CLOSED") return fail(`当前状态 ${po0.status} 不可收货`);

  const activeLines = lines.filter((r) => r.receiveQty > 0);
  if (activeLines.length === 0) return fail("请填写收货数量");
  const preLines = await prisma.purchaseOrderLine.findMany({ where: { id: { in: activeLines.map((r) => r.lineId) } } });
  const preById = new Map(preLines.map((l) => [l.id, l]));
  const skus = [...new Set(preLines.map((l) => l.sku))];
  const preProducts = await prisma.product.findMany({ where: { sku: { in: skus } } });
  const productBySku = new Map(preProducts.map((p) => [p.sku, p]));

  // 磅差容忍带 + 磅重数量级上限（防误输入污染均价：实磅 > 理论×3 一律拒绝，确认也不放行）
  const deviations: string[] = [];
  for (const r of activeLines) {
    const l = preById.get(r.lineId);
    if (!l || l.poNo !== params.poNo) return fail(`行 ${r.lineId} 不存在`);
    if (r.receiveQty > l.quantity - l.receivedQty) return fail(`行 ${l.sku} 超收（剩 ${l.quantity - l.receivedQty}）`);
    if (l.pricingUnit === "KG" && !r.weightKg) return fail(`行 ${l.sku} 按重量结算，必须填写本批磅重（kg）`);
    if (r.weightKg) {
      const p = productBySku.get(l.sku);
      const theoretical = theoreticalWeightKg(r.receiveQty, p?.lengthMm != null ? Number(p.lengthMm) : null, p?.weightPerMeter != null ? Number(p.weightPerMeter) : null);
      const dev = weightDeviation(r.weightKg, theoretical);
      if (theoretical != null && r.weightKg > theoretical * 3) {
        return fail(`磅重异常：${l.sku} 实磅 ${r.weightKg}kg 是理论 ${theoretical}kg 的 3 倍以上，请核对磅单/米重档案`);
      }
      if (dev != null && dev > WEIGHT_TOLERANCE) {
        if (!confirm) {
          return fail(`磅差超容忍带（±${Math.round(WEIGHT_TOLERANCE * 100)}%）：${l.sku} 实磅 ${r.weightKg}kg vs 理论 ${theoretical}kg，偏差 ${(dev * 100).toFixed(1)}%。核对磅单后勾选「确认按实磅收货」重试`, 409);
        }
        deviations.push(`${l.sku} ${r.weightKg}kg（偏差 ${(dev * 100).toFixed(1)}%）`);
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { poNo: params.poNo }, include: { lines: true } });
    if (!po) throw new Error("采购单不存在");
    if (po.status === "CANCELLED" || po.status === "CLOSED") throw new Error(`当前状态 ${po.status} 不可收货`);
    const byId = new Map(po.lines.map((l) => [l.id, l]));

    const avgUpdates: Array<{ sku: string; from: number | null; to: number; batchPerMeter: number; meters: number }> = [];
    const zeroPrice: string[] = [];
    for (const r of activeLines) {
      const l = byId.get(r.lineId);
      if (!l) throw new Error(`行 ${r.lineId} 不存在`);
      const remaining = l.quantity - l.receivedQty;
      if (r.receiveQty > remaining) throw new Error(`行 ${l.sku} 超收（剩 ${remaining}）`);
      // 增量写回防并发丢更新
      await tx.purchaseOrderLine.update({
        where: { id: l.id },
        data: {
          receivedQty: { increment: r.receiveQty },
          ...(r.weightKg ? { receivedWeightKg: { increment: r.weightKg } } : {}),
        },
      });

      const p = productBySku.get(l.sku);
      const isRawProfile = !!p && p.category === "PROFILE" && p.isRawMaterial && p.lengthMm != null;
      const barMm = p?.lengthMm != null ? Number(p.lengthMm) : null;
      const meters = barMm ? r.receiveQty * (barMm / 1000) : null;

      // 批次每米价：KG=结算单价×磅重÷米数；BAR=单价÷棒长
      let batchPerMeter: number | null = null;
      if (isRawProfile && meters && meters > 0) {
        if (l.pricingUnit === "KG" && l.settleUnitPrice != null && r.weightKg) {
          batchPerMeter = (Number(l.settleUnitPrice) * r.weightKg) / meters;
        } else if (l.pricingUnit !== "KG") {
          batchPerMeter = Number(l.unitPrice) / (barMm! / 1000);
        }
      }
      if (batchPerMeter != null && batchPerMeter <= 0) {
        zeroPrice.push(l.sku);
        batchPerMeter = null; // 0 价批次不滚均价（防把车间均价稀释向 0）
      }

      const noteParts = [note ?? null];
      if (r.weightKg) {
        const theoretical = theoreticalWeightKg(r.receiveQty, barMm, p?.weightPerMeter != null ? Number(p.weightPerMeter) : null);
        const dev = weightDeviation(r.weightKg, theoretical);
        noteParts.push(`磅重 ${r.weightKg}kg${dev != null ? `（偏差 ${(dev * 100).toFixed(1)}%）` : ""}`);
      }
      if (batchPerMeter != null) noteParts.push(`批次每米价 ¥${Math.round(batchPerMeter * 10000) / 10000}`);

      await applyStockMovement(tx, {
        workshopId: po.workshopId,
        sku: l.sku,
        productName: l.productName,
        delta: r.receiveQty,
        type: "PO_RECEIPT",
        refType: "PO",
        refNo: po.poNo,
        note: noteParts.filter(Boolean).join(" · ") || null,
        operatorName: session.user.name,
        unitCost: batchPerMeter != null ? Math.round(batchPerMeter * 10000) / 10000 : null,
        batchNo: batchNo?.trim() || null,
      });

      // 移动加权均价：库存行已被上面 applyStockMovement 更新，用收前数量与旧均价折算
      if (isRawProfile && batchPerMeter != null && barMm) {
        const inv = await tx.workshopInventory.findUnique({
          where: { workshopId_sku: { workshopId: po.workshopId, sku: l.sku } },
        });
        const oldQty = (inv?.quantity ?? 0) - r.receiveQty;
        const oldAvg = inv?.avgCostPerMeter != null ? Number(inv.avgCostPerMeter) : null;
        const newAvg = movingAveragePerMeter(oldQty, barMm, oldAvg, r.receiveQty, batchPerMeter);
        await tx.workshopInventory.update({
          where: { workshopId_sku: { workshopId: po.workshopId, sku: l.sku } },
          data: { avgCostPerMeter: newAvg },
        });
        avgUpdates.push({ sku: l.sku, from: oldAvg, to: newAvg, batchPerMeter: Math.round(batchPerMeter * 10000) / 10000, meters: Math.round(meters! * 100) / 100 });
      }
    }

    for (const u of avgUpdates) {
      await logAudit({
        action: "PO_AVG_COST_UPDATE",
        entityType: "WorkshopInventory",
        entityId: `${po.workshopId}|${u.sku}`,
        summary: `收货更新移动加权均价 ${u.sku}：${u.from ?? "无"} → ${u.to} 元/m（本批 ${u.batchPerMeter}/m × ${u.meters}m）`,
        detail: { poNo: po.poNo, workshopId: po.workshopId, sku: u.sku, from: u.from, to: u.to, batchPerMeter: u.batchPerMeter, batchMeters: u.meters },
        actor: session.user,
      }, tx);
    }
    if (deviations.length > 0) {
      await logAudit({
        action: "PO_WEIGHT_DEVIATION_CONFIRM",
        entityType: "PurchaseOrder",
        entityId: po.poNo,
        summary: `人工确认按实磅收货（超 ±${Math.round(WEIGHT_TOLERANCE * 100)}% 容忍带）：${deviations.join("；")}`,
        detail: { poNo: po.poNo, deviations },
        actor: session.user,
      }, tx);
    }
    if (zeroPrice.length > 0) {
      await logAudit({
        action: "PO_ZERO_PRICE_RECEIPT",
        entityType: "PurchaseOrder",
        entityId: po.poNo,
        summary: `0 价批次未滚均价：${zeroPrice.join("、")}（请补采购单价后重新收货或手工维护均价）`,
        detail: { poNo: po.poNo, skus: zeroPrice },
        actor: session.user,
      }, tx);
    }

    // Recompute PO status（按行重读，天然免并发漂移）
    const refreshed = await tx.purchaseOrderLine.findMany({ where: { poNo: po.poNo } });
    const allDone = refreshed.every((l) => l.receivedQty >= l.quantity);
    const anyRecv = refreshed.some((l) => l.receivedQty > 0);
    const newStatus = allDone ? "RECEIVED" : anyRecv ? "PARTIALLY_RECEIVED" : po.status;
    if (newStatus !== po.status) {
      await tx.purchaseOrder.update({ where: { poNo: po.poNo }, data: { status: newStatus } });
    }
    return { ok: true, avgUpdates, zeroPrice };
  });

  return ok(result);
}
