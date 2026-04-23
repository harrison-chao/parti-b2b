import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";

const taskSchema = z.object({
  customerId: z.string().optional().nullable(),
  opportunityId: z.string().optional().nullable(),
  title: z.string().trim().min(1),
  dueAt: z.string(),
  reminderContent: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "DEALER" || !session.user.dealerId) return fail("仅经销商可创建任务", 403, 403);
  const parsed = taskSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;
  if (data.customerId) {
    const customer = await prisma.crmCustomer.findFirst({ where: { id: data.customerId, dealerId: session.user.dealerId } });
    if (!customer) return fail("客户不存在", 404, 404);
  }
  const task = await prisma.crmTask.create({
    data: {
      dealerId: session.user.dealerId,
      customerId: data.customerId || null,
      opportunityId: data.opportunityId || null,
      title: data.title,
      dueAt: new Date(data.dueAt),
      reminderContent: data.reminderContent || null,
      assigneeUserId: session.user.id,
      createdBy: session.user.name,
    },
  });
  return ok({ task });
}
