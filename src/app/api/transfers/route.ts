import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { applyStockMovement, movingAveragePerMeter } from "@/lib/inventory";

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

  // 并发撞号（transferNo 唯一约束 P2002）换号重试，最多 3 次
  for (let attempt = 0; attempt < 3; attempt++) {
  try {
    // 大批量调拨（整仓 50 行）逐行出入库会超过 Prisma 默认 5s 事务超时 → 放宽到 30s
    const result = await prisma.$transaction(async (tx) => {
      const seq = await tx.transferOrder.count();
      const transferNo = `TR-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${String(seq + 1 + attempt).padStart(3, "0")}`;

      // 预检一次批量做（applyStockMovement 内仍会逐行兜底负库存校验）
      const skus = d.lines.map((l) => l.sku);
      const preRows = await tx.workshopInventory.findMany({
        where: { workshopId: d.fromWorkshopId, sku: { in: skus } },
      });
      const preBySku = new Map(preRows.map((r) => [r.sku, r]));
      const wantBySku = new Map<string, number>();
      for (const line of d.lines) wantBySku.set(line.sku, (wantBySku.get(line.sku) ?? 0) + line.quantity);
      for (const [sku, qty] of wantBySku) {
        const src = preBySku.get(sku);
        if (!src || src.quantity < qty) {
          throw new Error(`${from.name} 库存不足：${sku} 现存 ${src?.quantity ?? 0}，调拨 ${qty}`);
        }
      }

      const transfer = await tx.transferOrder.create({
        data: {
          transferNo,
          fromWorkshopId: d.fromWorkshopId,
          toWorkshopId: d.toWorkshopId,
          note: d.note ?? null,
          operatorName: session.user?.name ?? session.user?.email ?? null,
          lines: { create: d.lines.map((l) => ({ sku: l.sku, productName: preBySku.get(l.sku)?.productName ?? l.sku, quantity: l.quantity })) },
        },
      });

      for (const line of d.lines) {
        const src = (await tx.workshopInventory.findUnique({
          where: { workshopId_sku: { workshopId: d.fromWorkshopId, sku: line.sku } },
        }))!;

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
        const barMm = product?.lengthMm != null ? Number(product.lengthMm) : 0;
        // 有棒长按米数、缺棒长按根数（barMm=0 时 movingAveragePerMeter 退化为根数加权），不静默覆盖有存量的均价
        if (dst && dst.avgCostPerMeter != null && inboundAvg != null && dst.quantity > 0) {
          inboundAvg = movingAveragePerMeter(dst.quantity, barMm, Number(dst.avgCostPerMeter), line.quantity, inboundAvg);
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
    }, { timeout: 30000 });

    await logAudit({
      action: "TRANSFER_CREATE", entityType: "TransferOrder", entityId: result.id,
      summary: `调拨单 ${result.transferNo}：${from.name} → ${to.name}，${d.lines.length} 行`,
      detail: { transferNo: result.transferNo, lines: d.lines },
      actor: session.user,
    });
    return ok(result);
  } catch (e: any) {
    if (e?.code === "P2002" && attempt < 2) continue; // 撞号换号重试
    return fail(e?.message ?? "调拨失败", 409, 409);
  }
  }
  return fail("调拨失败：重试耗尽", 409, 409);
}
