import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { generateCombosFromHistory } from "@/lib/combo";

export const runtime = "nodejs";

/** 从历史订单（含 Base 774 条迁移数据）归集常用组合候选 */
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("无权操作", 403, 403);
  const result = await generateCombosFromHistory(prisma);
  return ok(result);
}
