import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";

const logSchema = z.object({
  method: z.enum(["PHONE", "WECHAT", "VISIT", "ONSITE", "MEETING", "OTHER"]).default("PHONE"),
  content: z.string().trim().min(1),
  outcome: z.string().optional().nullable(),
  nextAction: z.string().optional().nullable(),
  opportunityId: z.string().optional().nullable(),
  nextFollowAt: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "DEALER" || !session.user.dealerId) return fail("仅经销商可写跟进", 403, 403);
  const customer = await prisma.crmCustomer.findFirst({ where: { id: params.id, dealerId: session.user.dealerId } });
  if (!customer) return fail("客户不存在", 404, 404);
  const parsed = logSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;

  const result = await prisma.$transaction(async (tx) => {
    const log = await tx.crmContactLog.create({
      data: {
        dealerId: session.user.dealerId!,
        customerId: params.id,
        opportunityId: data.opportunityId || null,
        method: data.method,
        content: data.content,
        outcome: data.outcome || null,
        nextAction: data.nextAction || null,
        createdBy: session.user.name,
      },
    });
    await tx.crmCustomer.update({
      where: { id: params.id },
      data: {
        lastContactAt: new Date(),
        nextFollowAt: data.nextFollowAt ? new Date(data.nextFollowAt) : customer.nextFollowAt,
        stage: customer.stage === "LEAD" ? "POTENTIAL" : customer.stage,
      },
    });
    return log;
  });

  return ok({ log: result });
}
