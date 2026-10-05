import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
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
  // 磅差超过容忍带时需显式确认（前端弹窗后重发）
  confirm: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { poNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可收货", 403, 403);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { lines, note, confirm } = parsed.data;

  const po = await prisma.purchaseOrder.findUnique({
    where: { poNo: params.poNo },
    include: { lines: true },
  });
  if (!po) return fail("采购单不存在", 404, 404);
  if (po.status === "CANCELLED" || po.status === "CLOSED") return fail(`当前状态 ${po.status} 不可收货`);

  const byId = new Map(po.lines.map((l) => [l.id, l]));
  const activeLines = lines.filter((r) => r.receiveQty > 0);
  for (const r of activeLines) {
    const l = byId.get(r.lineId);
    if (!l) return fail(`行 ${r.lineId} 不存在`);
    const remaining = l.quantity - l.receivedQty;
    if (r.receiveQty > remaining) return fail(`行 ${l.sku} 超收（剩 ${remaining}）`);
    if (l.pricingUnit === "KG" && !r.weightKg) return fail(`行 ${l.sku} 按重量结算，必须填写本批磅重（kg）`);
  }
  if (activeLines.length === 0) return fail("请填写收货数量");

  // 原料档案（棒长/米重）：批次价折算与磅差校验都要用
  const skus = [...new Set(activeLines.map((r) => byId.get(r.lineId)!.sku))];
  const products = await prisma.product.findMany({ where: { sku: { in: skus } } });
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  // 磅差容忍带：实磅 vs 理论（根×定尺×米重）超差需确认后重发
  if (!confirm) {
    for (const r of activeLines) {
      const l = byId.get(r.lineId)!;
      const p = productBySku.get(l.sku);
      if (!r.weightKg || !p) continue;
      const theoretical = theoreticalWeightKg(r.receiveQty, p.lengthMm != null ? Number(p.lengthMm) : null, p.weightPerMeter != null ? Number(p.weightPerMeter) : null);
      const dev = weightDeviation(r.weightKg, theoretical);
      if (dev != null && dev > WEIGHT_TOLERANCE) {
        return fail(`磅差超容忍带（±${Math.round(WEIGHT_TOLERANCE * 100)}%）：${l.sku} 实磅 ${r.weightKg}kg vs 理论 ${theoretical}kg，偏差 ${(dev * 100).toFixed(1)}%。核对磅单后勾选「确认按实磅收货」重试`, 409);
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const avgUpdates: Array<{ sku: string; from: number | null; to: number; batchPerMeter: number; meters: number }> = [];
    for (const r of activeLines) {
      const l = byId.get(r.lineId)!;
      await tx.purchaseOrderLine.update({
        where: { id: l.id },
        data: {
          receivedQty: l.receivedQty + r.receiveQty,
          ...(r.weightKg ? { receivedWeightKg: (l.receivedWeightKg != null ? Number(l.receivedWeightKg) : 0) + r.weightKg } : {}),
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

    // 均价重算留痕 old→new（评审 C9：成本变动可追溯）
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

    // Recompute PO status
    const refreshed = await tx.purchaseOrderLine.findMany({ where: { poNo: po.poNo } });
    const allDone = refreshed.every((l) => l.receivedQty >= l.quantity);
    const anyRecv = refreshed.some((l) => l.receivedQty > 0);
    const newStatus = allDone ? "RECEIVED" : anyRecv ? "PARTIALLY_RECEIVED" : po.status;
    if (newStatus !== po.status) {
      await tx.purchaseOrder.update({ where: { poNo: po.poNo }, data: { status: newStatus } });
    }
    return { ok: true, avgUpdates };
  });

  return ok(result);
}
