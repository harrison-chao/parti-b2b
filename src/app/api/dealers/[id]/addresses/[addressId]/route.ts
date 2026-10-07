import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const patchSchema = z.object({
  label: z.string().optional().nullable(),
  addressType: z.enum(["warehouse", "dropship"]).optional(),
  receiverName: z.string().min(1).optional(),
  receiverPhone: z.string().min(1).optional(),
  province: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  district: z.string().min(1).optional(),
  detailAddress: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});

async function guard(params: { id: string; addressId: string }) {
  const session = await auth();
  if (!session) return { error: fail("未登录", 401, 401) } as const;
  // 客户地址簿：管理员全量，经销商只能动自己的
  if (session.user.role !== "ADMIN" && !(session.user.role === "DEALER" && session.user.dealerId === params.id)) {
    return { error: fail("无权操作该地址簿", 403, 403) } as const;
  }
  const addr = await prisma.dealerAddress.findUnique({ where: { id: params.addressId } });
  if (!addr || addr.dealerId !== params.id) return { error: fail("地址不存在", 404, 404) } as const;
  return { session, addr } as const;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; addressId: string } }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const d = parsed.data;
  // 设默认时清掉同客户其它默认
  if (d.isDefault) {
    await prisma.dealerAddress.updateMany({ where: { dealerId: params.id }, data: { isDefault: false } });
  }
  const addr = await prisma.dealerAddress.update({ where: { id: params.addressId }, data: d });
  return ok(addr);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; addressId: string } }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  await prisma.dealerAddress.delete({ where: { id: params.addressId } });
  if (g.session.user.role === "ADMIN") {
    await logAudit({
      action: "DEALER_ADDRESS_DELETE", entityType: "DealerAddress", entityId: params.addressId,
      summary: `删除客户地址：${g.addr.receiverName} ${g.addr.province}${g.addr.city}${g.addr.district}${g.addr.detailAddress}`,
      actor: g.session.user,
    });
  }
  return ok({ id: params.addressId });
}
