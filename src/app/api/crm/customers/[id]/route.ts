import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";

const patchSchema = z.object({
  customerType: z.enum(["INDIVIDUAL", "COMPANY", "DESIGNER", "CONTRACTOR"]).optional(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  wechat: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  stage: z.enum(["LEAD", "POTENTIAL", "QUOTED", "DEAL", "LOST"]).optional(),
  intentLevel: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().nullable(),
  budget: z.number().nonnegative().optional().nullable(),
  demand: z.string().optional().nullable(),
  nextFollowAt: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

async function requireDealerCustomer(id: string) {
  const session = await auth();
  if (!session || session.user.role !== "DEALER" || !session.user.dealerId) {
    return { error: fail("仅经销商可访问 CRM", 403, 403), session: null, customer: null };
  }
  const customer = await prisma.crmCustomer.findFirst({ where: { id, dealerId: session.user.dealerId } });
  if (!customer) return { error: fail("客户不存在", 404, 404), session, customer: null };
  return { error: null, session, customer };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireDealerCustomer(params.id);
  if (guard.error) return guard.error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;

  const customer = await prisma.crmCustomer.update({
    where: { id: params.id },
    data: {
      ...data,
      email: data.email === "" ? null : data.email,
      nextFollowAt: data.nextFollowAt === undefined ? undefined : (data.nextFollowAt ? new Date(data.nextFollowAt) : null),
    },
  });
  return ok({ customer });
}
