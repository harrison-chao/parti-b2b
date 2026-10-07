import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail, requireRole } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().optional(),
  contactName: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireRole("ADMIN");
  if (guard.response) return guard.response;
  const session = guard.session;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const workshop = await prisma.workshop.update({ where: { id: params.id }, data: parsed.data });
  return ok(workshop);
}

// 管理员删除车间：有工单/账号/库存/流水/盘点/采购单则拒绝（保历史），无引用才物理删除
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireRole("ADMIN");
  if (guard.response) return guard.response;
  const session = guard.session;
  const w = await prisma.workshop.findUnique({
    where: { id: params.id },
    include: { _count: { select: { workOrders: true, users: true, inventory: true, movements: true, stockCounts: true, purchaseOrders: true } } },
  });
  if (!w) return fail("车间不存在", 404, 404);
  const refs = w._count;
  const total = refs.workOrders + refs.users + refs.inventory + refs.movements + refs.stockCounts + refs.purchaseOrders;
  if (total > 0) {
    return fail(`该车间已有业务数据（工单 ${refs.workOrders}、账号 ${refs.users}、库存 ${refs.inventory}、流水 ${refs.movements}、盘点 ${refs.stockCounts}、采购单 ${refs.purchaseOrders}），不能删除；请改为停用`, 409, 409);
  }
  await prisma.workshop.delete({ where: { id: w.id } });
  await logAudit({
    action: "WORKSHOP_DELETE", entityType: "Workshop", entityId: w.id,
    summary: `删除车间 ${w.name}（无业务引用）`, actor: session.user,
  });
  return ok({ id: w.id });
}
