import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { applyStockMovement } from "@/lib/inventory";

const createSchema = z.object({
  fromWorkshopId: z.string().min(1),
  toWorkshopId: z.string().min(1),
  note: z.string().optional().nullable(),
  lines: z.array(z.object({
    sku: z.string().min(1),
    quantity: z.number().int().positive(),
  })).min(1),
});

export async function GET() {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可查看调拨单", 403, 403);
  const transfers = await prisma.transferOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      lines: true,
      fromWorkshop: { select: { name: true } },
      toWorkshop: { select: { name: true } },
    },
  });
  return ok(transfers);
}

/**
 * 创建并立即执行调拨（总部仓 ↔ 车间仓）：
 * 一笔事务里 出库(TRANSFER_OUT) + 入库(TRANSFER_IN) 两条流水；数量移动、每米成本随行——
 * 目标仓已有量的按米数加权融合均价，空仓直接带入源仓均价。
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可调拨", 403, 403);
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  if (d.fromWorkshopId === d.toWorkshopId) return fail("调出仓与调入仓不能相同");

  const [from, to] = await Promise.all([
    prisma.workshop.findUnique({ where: { id: d.fromWorkshopId } }),
    prisma.workshop.findUnique({ where: { id: d.toWorkshopId } }),
  ]);
  if (!from || !to) return fail("仓库不存在", 404, 404);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const seq = await tx.transferOrder.count();
      const transferNo = `TR-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${String(seq + 1).padStart(3, "0")}`;

      for (const line of d.lines) {
        const src = await tx.workshopInventory.findUnique({
          where: { workshopId_sku: { workshopId: d.fromWorkshopId, sku: line.sku } },
        });
        if (!src || src.quantity < line.quantity) {
          throw new Error(`${from.name} 库存不足：${line.sku} 现存 ${src?.quantity ?? 0}，调拨 ${line.quantity}`);
        }
      }

      const transfer = await tx.transferOrder.create({
        data: {
          transferNo,
          fromWorkshopId: d.fromWorkshopId,
          toWorkshopId: d.toWorkshopId,
          note: d.note ?? null,
          operatorName: session.user?.name ?? session.user?.email ?? null,
          lines: { create: d.lines.map((l) => ({ sku: l.sku, productName: "", quantity: l.quantity })) },
        },
      });

      for (const line of d.lines) {
        const src = (await tx.workshopInventory.findUnique({
          where: { workshopId_sku: { workshopId: d.fromWorkshopId, sku: line.sku } },
        }))!;
        await tx.transferLine.updateMany({ where: { transferId: transfer.id, sku: line.sku }, data: { productName: src.productName } });

        await applyStockMovement(tx, {
          workshopId: d.fromWorkshopId, sku: line.sku, productName: src.productName,
          delta: -line.quantity, type: "TRANSFER_OUT",
          refType: "TRANSFER", refNo: transferNo,
          unitCost: src.avgCostPerMeter != null ? Number(src.avgCostPerMeter) : null,
          note: `调拨至 ${to.name}`,
          operatorName: session.user?.name ?? null,
        });

        // 目标仓均价：同 SKU 按 米数加权 融合；目标无均价直接带入
        const dst = await tx.workshopInventory.findUnique({
          where: { workshopId_sku: { workshopId: d.toWorkshopId, sku: line.sku } },
        });
        let inboundAvg: number | null = src.avgCostPerMeter != null ? Number(src.avgCostPerMeter) : null;
        const product = await tx.product.findUnique({ where: { sku: line.sku }, select: { lengthMm: true } });
        const m = product?.lengthMm != null ? Number(product.lengthMm) / 1000 : null;
        if (dst && dst.avgCostPerMeter != null && inboundAvg != null && m && dst.quantity > 0) {
          const totalMeters = (dst.quantity + line.quantity) * m;
          inboundAvg = Math.round(((dst.quantity * m * Number(dst.avgCostPerMeter) + line.quantity * m * inboundAvg) / totalMeters) * 10000) / 10000;
        }

        await applyStockMovement(tx, {
          workshopId: d.toWorkshopId, sku: line.sku, productName: src.productName,
          delta: line.quantity, type: "TRANSFER_IN",
          refType: "TRANSFER", refNo: transferNo,
          unitCost: src.avgCostPerMeter != null ? Number(src.avgCostPerMeter) : null,
          avgCostPerMeter: inboundAvg,
          note: `调拨自 ${from.name}`,
          operatorName: session.user?.name ?? null,
        });
      }
      return transfer;
    });

    await logAudit({
      action: "TRANSFER_CREATE", entityType: "TransferOrder", entityId: result.id,
      summary: `调拨单 ${result.transferNo}：${from.name} → ${to.name}，${d.lines.length} 行`,
      detail: { transferNo: result.transferNo, lines: d.lines },
      actor: session.user,
    });
    return ok(result);
  } catch (e: any) {
    return fail(e?.message ?? "调拨失败", 409, 409);
  }
}
