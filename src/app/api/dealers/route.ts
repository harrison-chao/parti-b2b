import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

export async function GET() {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role === "DEALER") return fail("无权访问", 403, 403);
  const dealers = await prisma.dealer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { salesOrders: true } } },
  });
  return ok({ dealers });
}
