import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  lowStockThreshold: z.number().int().nonnegative(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN" && session.user.role !== "WORKSHOP") return fail("无权维护库存阈值", 403, 403);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);

  const item = await prisma.workshopInventory.findUnique({ where: { id: params.id } });
  if (!item) return fail("库存记录不存在", 404, 404);
  if (session.user.role === "WORKSHOP" && item.workshopId !== session.user.workshopId) return fail("非本车间库存", 403, 403);

  const updated = await prisma.workshopInventory.update({
    where: { id: params.id },
    data: { lowStockThreshold: parsed.data.lowStockThreshold },
  });
  await logAudit({
    action: "INVENTORY_THRESHOLD_UPDATE",
    entityType: "WorkshopInventory",
    entityId: item.id,
    targetWorkshopId: item.workshopId,
    summary: `修改库存预警阈值：${item.sku}`,
    detail: {
      sku: item.sku,
      productName: item.productName,
      before: item.lowStockThreshold,
      after: parsed.data.lowStockThreshold,
    },
    actor: session.user,
  });
  return ok({ item: updated });
}
