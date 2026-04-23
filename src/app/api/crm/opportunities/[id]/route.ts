import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";

const patchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  stage: z.enum(["DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]).optional(),
  estimatedBudget: z.number().nonnegative().optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  actualAmount: z.number().nonnegative().optional().nullable(),
  lostReason: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "DEALER" || !session.user.dealerId) return fail("仅经销商可更新商机", 403, 403);

  const existing = await prisma.crmOpportunity.findFirst({
    where: { id: params.id, dealerId: session.user.dealerId },
    include: { customer: { select: { id: true, stage: true } } },
  });
  if (!existing) return fail("商机不存在", 404, 404);

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;
  const nextStage = data.stage ?? existing.stage;

  const opportunity = await prisma.$transaction(async (tx) => {
    const updated = await tx.crmOpportunity.update({
      where: { id: params.id },
      data: {
        title: data.title,
        stage: data.stage,
        estimatedBudget: data.estimatedBudget === undefined ? undefined : data.estimatedBudget,
        expectedCloseDate: data.expectedCloseDate === undefined ? undefined : (data.expectedCloseDate ? new Date(data.expectedCloseDate) : null),
        actualAmount: data.actualAmount === undefined || data.actualAmount === null ? undefined : data.actualAmount,
        lostReason: data.lostReason === undefined ? undefined : data.lostReason || null,
        remark: data.remark === undefined ? undefined : data.remark || null,
        wonAt: nextStage === "WON" && existing.stage !== "WON" ? new Date() : nextStage === "WON" ? existing.wonAt : null,
      },
    });

    if (data.stage === "WON") {
      await tx.crmCustomer.update({
        where: { id: existing.customerId },
        data: { stage: "DEAL", lastContactAt: new Date() },
      });
    } else if (existing.customer.stage === "LEAD") {
      await tx.crmCustomer.update({
        where: { id: existing.customerId },
        data: { stage: "POTENTIAL" },
      });
    }

    return updated;
  });

  return ok({ opportunity });
}
