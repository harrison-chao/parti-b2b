import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { applyStockMovement } from "@/lib/inventory";

export async function POST(_req: NextRequest, { params }: { params: { countNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可审核盘点", 403, 403);

  const sc = await prisma.stockCount.findUnique({
    where: { countNo: params.countNo },
    include: { lines: true },
  });
  if (!sc) return fail("盘点单不存在", 404, 404);
  if (sc.status !== "SUBMITTED") return fail("仅已提交盘点单可审核");

  const existingAdjustment = await prisma.stockMovement.count({
    where: { refType: "SC", refNo: sc.countNo, type: "STOCK_COUNT_ADJUST" },
  });
  if (existingAdjustment > 0) return fail("该盘点单已存在调整流水，请勿重复审核");

  try {
    await prisma.$transaction(async (tx) => {
      for (const line of sc.lines) {
        if (line.diff === 0) continue;
        await applyStockMovement(tx, {
          workshopId: sc.workshopId,
          sku: line.sku,
          productName: line.productName,
          delta: line.diff,
          type: "STOCK_COUNT_ADJUST",
          refType: "SC",
          refNo: sc.countNo,
          note: `盘点调整：系统 ${line.systemQty} → 实盘 ${line.actualQty}`,
          operatorName: session.user.name,
        });
      }

      await tx.stockCount.update({
        where: { countNo: params.countNo },
        data: {
          status: "APPROVED",
          approvedBy: session.user.name,
          approvedAt: new Date(),
        },
      });
    }, { timeout: 120_000, maxWait: 120_000 });
  } catch (error: any) {
    return fail(error?.message ?? "盘点审核失败");
  }

  return ok({ ok: true });
}
