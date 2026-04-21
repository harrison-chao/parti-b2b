import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

// Workshop submission only locks the count for admin review. Inventory is adjusted on approval.
export async function POST(_req: NextRequest, { params }: { params: { countNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const sc = await prisma.stockCount.findUnique({
    where: { countNo: params.countNo },
    include: { lines: true },
  });
  if (!sc) return fail("盘点单不存在", 404, 404);
  if (session.user.role === "WORKSHOP" && sc.workshopId !== session.user.workshopId) return fail("非本车间", 403, 403);
  if (sc.status !== "DRAFT") return fail("仅草稿状态可提交");

  await prisma.stockCount.update({
    where: { countNo: params.countNo },
    data: {
      status: "SUBMITTED",
      submittedBy: session.user.name,
      submittedAt: new Date(),
    },
  });

  return ok({ ok: true });
}
