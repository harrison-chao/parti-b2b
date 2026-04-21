import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { applyStockMovement } from "@/lib/inventory";
import { z } from "zod";

const schema = z.object({
  lines: z.array(z.object({
    lineId: z.string().min(1),
    receiveQty: z.number().int().nonnegative(),
  })).min(1),
  note: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { poNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可收货", 403, 403);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { lines, note } = parsed.data;

  const po = await prisma.purchaseOrder.findUnique({
    where: { poNo: params.poNo },
    include: { lines: true },
  });
  if (!po) return fail("采购单不存在", 404, 404);
  if (po.status === "CANCELLED" || po.status === "CLOSED") return fail(`当前状态 ${po.status} 不可收货`);

  const byId = new Map(po.lines.map((l) => [l.id, l]));
  for (const r of lines) {
    const l = byId.get(r.lineId);
    if (!l) return fail(`行 ${r.lineId} 不存在`);
    const remaining = l.quantity - l.receivedQty;
    if (r.receiveQty > remaining) return fail(`行 ${l.sku} 超收（剩 ${remaining}）`);
  }

  const totalReceiveThisTime = lines.reduce((s, l) => s + l.receiveQty, 0);
  if (totalReceiveThisTime === 0) return fail("请填写收货数量");

  await prisma.$transaction(async (tx) => {
    for (const r of lines) {
      if (r.receiveQty === 0) continue;
      const l = byId.get(r.lineId)!;
      await tx.purchaseOrderLine.update({
        where: { id: l.id },
        data: { receivedQty: l.receivedQty + r.receiveQty },
      });
      await applyStockMovement(tx, {
        workshopId: po.workshopId,
        sku: l.sku,
        productName: l.productName,
        delta: r.receiveQty,
        type: "PO_RECEIPT",
        refType: "PO",
        refNo: po.poNo,
        note: note ?? null,
        operatorName: session.user.name,
      });
    }

    // Recompute PO status
    const refreshed = await tx.purchaseOrderLine.findMany({ where: { poNo: po.poNo } });
    const allDone = refreshed.every((l) => l.receivedQty >= l.quantity);
    const anyRecv = refreshed.some((l) => l.receivedQty > 0);
    const newStatus = allDone ? "RECEIVED" : anyRecv ? "PARTIALLY_RECEIVED" : po.status;
    if (newStatus !== po.status) {
      await tx.purchaseOrder.update({ where: { poNo: po.poNo }, data: { status: newStatus } });
    }
  });

  return ok({ ok: true });
}
