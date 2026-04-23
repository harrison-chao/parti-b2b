import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";

const patchSchema = z.object({
  status: z.enum(["PENDING", "DONE", "CANCELLED"]),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "DEALER" || !session.user.dealerId) return fail("仅经销商可更新任务", 403, 403);
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const exists = await prisma.crmTask.findFirst({ where: { id: params.id, dealerId: session.user.dealerId } });
  if (!exists) return fail("任务不存在", 404, 404);
  const task = await prisma.crmTask.update({
    where: { id: params.id },
    data: {
      status: parsed.data.status,
      completedAt: parsed.data.status === "DONE" ? new Date() : null,
    },
  });
  return ok({ task });
}
