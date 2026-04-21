import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { genStockCountNo } from "@/lib/utils";
import { z } from "zod";

const createSchema = z.object({
  remark: z.string().optional().nullable(),
});

// Creates a DRAFT stock count by snapshotting current inventory of the caller's workshop.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "WORKSHOP") return fail("仅车间可盘点", 403, 403);
  if (!session.user.workshopId) return fail("账号未绑定车间");
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);

  const inv = await prisma.workshopInventory.findMany({
    where: { workshopId: session.user.workshopId },
    orderBy: { sku: "asc" },
  });
  if (inv.length === 0) return fail("当前无任何库存项可盘");

  const countNo = genStockCountNo();
  const sc = await prisma.stockCount.create({
    data: {
      countNo,
      workshopId: session.user.workshopId,
      status: "DRAFT",
      remark: parsed.data.remark ?? null,
      lines: {
        create: inv.map((i) => ({
          sku: i.sku,
          productName: i.productName,
          systemQty: i.quantity,
          actualQty: i.quantity, // 默认等于系统，车间按实盘修改
          diff: 0,
        })),
      },
    },
  });
  return ok(sc);
}

export async function GET() {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const where: any = {};
  if (session.user.role === "WORKSHOP") where.workshopId = session.user.workshopId;
  const counts = await prisma.stockCount.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { workshop: { select: { code: true, name: true } }, _count: { select: { lines: true } } },
  });
  return ok(counts);
}
