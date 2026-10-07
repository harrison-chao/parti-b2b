import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  // 地址簿含收货人 PII：仅管理员或本人（同 [addressId] 守卫口径，WORKSHOP 不放行）
  if (session.user.role !== "ADMIN" && !(session.user.role === "DEALER" && session.user.dealerId === params.id)) {
    return fail("无权访问", 403, 403);
  }
  const addresses = await prisma.dealerAddress.findMany({
    where: { dealerId: params.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return ok({ addresses });
}

const schema = z.object({
  receiverName: z.string().min(1),
  receiverPhone: z.string().min(1),
  province: z.string().default(""),
  city: z.string().default(""),
  district: z.string().default(""),
  detailAddress: z.string().min(1),
  isDefault: z.boolean().optional(),
  // 代发场景：标签=终端客户名/门店名；类型 warehouse=客户自用 / dropship=代发直发
  label: z.string().optional().nullable(),
  addressType: z.enum(["warehouse", "dropship"]).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN" && !(session.user.role === "DEALER" && session.user.dealerId === params.id)) {
    return fail("无权操作", 403, 403);
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  if (parsed.data.isDefault) {
    await prisma.dealerAddress.updateMany({ where: { dealerId: params.id }, data: { isDefault: false } });
  }
  const addr = await prisma.dealerAddress.create({
    data: { ...parsed.data, dealerId: params.id },
  });
  return ok(addr);
}
