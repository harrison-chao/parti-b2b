import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";

const customerSchema = z.object({
  customerType: z.enum(["INDIVIDUAL", "COMPANY", "DESIGNER", "CONTRACTOR"]).default("INDIVIDUAL"),
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  wechat: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  stage: z.enum(["LEAD", "POTENTIAL", "QUOTED", "DEAL", "LOST"]).default("LEAD"),
  intentLevel: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().nullable(),
  budget: z.number().nonnegative().optional().nullable(),
  demand: z.string().optional().nullable(),
  nextFollowAt: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
});

function dealerIdFromSession(session: any) {
  if (!session || session.user.role !== "DEALER" || !session.user.dealerId) return null;
  return session.user.dealerId;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const dealerId = dealerIdFromSession(session);
  if (!dealerId) return fail("仅经销商可访问 CRM", 403, 403);

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim();
  const stage = searchParams.get("stage");
  const where: any = { dealerId };
  if (stage && stage !== "ALL") where.stage = stage;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { demand: { contains: q, mode: "insensitive" } },
      { source: { contains: q, mode: "insensitive" } },
    ];
  }

  const customers = await prisma.crmCustomer.findMany({
    where,
    orderBy: [{ nextFollowAt: "asc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { contactLogs: true, opportunities: true, tasks: true, salesOrders: true } },
    },
  });

  return ok({ customers });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const dealerId = dealerIdFromSession(session);
  if (!dealerId) return fail("仅经销商可创建 CRM 客户", 403, 403);

  const parsed = customerSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;

  const customer = await prisma.crmCustomer.create({
    data: {
      dealerId,
      customerType: data.customerType,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      wechat: data.wechat || null,
      address: data.address || null,
      region: data.region || null,
      source: data.source || null,
      tags: data.tags ?? [],
      stage: data.stage,
      intentLevel: data.intentLevel ?? null,
      budget: data.budget ?? null,
      demand: data.demand || null,
      nextFollowAt: data.nextFollowAt ? new Date(data.nextFollowAt) : null,
      remark: data.remark || null,
      ownerUserId: session!.user.id,
      createdBy: session!.user.name,
    },
  });

  return ok({ customer });
}
