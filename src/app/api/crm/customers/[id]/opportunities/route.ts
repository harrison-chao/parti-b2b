import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";

const opportunitySchema = z.object({
  title: z.string().trim().min(1),
  stage: z.enum(["DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]).default("DISCOVERY"),
  estimatedBudget: z.number().nonnegative().optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session || session.user.role !== "DEALER" || !session.user.dealerId) return fail("仅经销商可创建商机", 403, 403);
  const customer = await prisma.crmCustomer.findFirst({ where: { id: params.id, dealerId: session.user.dealerId } });
  if (!customer) return fail("客户不存在", 404, 404);
  const parsed = opportunitySchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;
  const opportunity = await prisma.crmOpportunity.create({
    data: {
      dealerId: session.user.dealerId,
      customerId: params.id,
      title: data.title,
      stage: data.stage,
      estimatedBudget: data.estimatedBudget ?? null,
      expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
      remark: data.remark || null,
      createdBy: session.user.name,
    },
  });
  return ok({ opportunity });
}
