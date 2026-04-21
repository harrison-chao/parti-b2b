import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const patchSchema = z.object({
  lines: z.array(z.object({ id: z.string().min(1), actualQty: z.number().int().nonnegative() })).optional(),
  remark: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: { countNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const sc = await prisma.stockCount.findUnique({ where: { countNo: params.countNo } });
  if (!sc) return fail("盘点单不存在", 404, 404);
  if (session.user.role === "WORKSHOP" && sc.workshopId !== session.user.workshopId) return fail("非本车间", 403, 403);
  if (sc.status !== "DRAFT") return fail("仅草稿状态可编辑");

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;

  await prisma.$transaction(async (tx) => {
    if (d.remark !== undefined) {
      await tx.stockCount.update({ where: { countNo: params.countNo }, data: { remark: d.remark } });
    }
    if (d.lines) {
      for (const l of d.lines) {
        const line = await tx.stockCountLine.findUnique({ where: { id: l.id } });
        if (!line || line.countNo !== params.countNo) continue;
        await tx.stockCountLine.update({
          where: { id: l.id },
          data: { actualQty: l.actualQty, diff: l.actualQty - line.systemQty },
        });
      }
    }
  });

  return ok({ ok: true });
}
