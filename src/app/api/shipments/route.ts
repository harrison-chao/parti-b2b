import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { createShipment, searchShipments } from "@/lib/shipment";
import { z } from "zod";

const schema = z.object({
  carrier: z.string().min(1),
  trackingNo: z.string().optional().nullable(),
  shippedAt: z.string().optional().nullable(),
  freightPayType: z.enum(["PREPAID", "COD", "MONTHLY"]).optional(),
  fromType: z.enum(["FACTORY", "OUTSOURCER"]).optional(),
  fromNote: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  lines: z.array(z.object({
    orderNo: z.string(),
    lineId: z.string(),
    quantity: z.number().int().positive(),
  })).min(1),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (q) return ok({ shipments: await searchShipments(prisma, q) });
  const shipments = await prisma.shipment.findMany({
    orderBy: { shippedAt: "desc" },
    take: 50,
    include: { lines: { include: { order: { select: { orderNo: true, displayOrderNo: true, receiverName: true, receiverAddress: true } } } } },
  });
  return ok({ shipments });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "WORKSHOP") return fail("无权操作", 403, 403);

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const data = parsed.data;

  // 车间只能给自己车间的订单发货
  if (role === "WORKSHOP") {
    const orderNos = [...new Set(data.lines.map((l) => l.orderNo))];
    const wos = await prisma.workOrder.findMany({ where: { orderNo: { in: orderNos } } });
    for (const wo of wos) {
      if (wo.workshopId !== session.user.workshopId) return fail(`订单 ${wo.orderNo} 非本车间`, 403, 403);
    }
  }

  try {
    const shipment = await prisma.$transaction((tx) =>
      createShipment(tx, {
        carrier: data.carrier,
        trackingNo: data.trackingNo ?? null,
        shippedAt: data.shippedAt ? new Date(data.shippedAt) : undefined,
        freightPayType: data.freightPayType,
        fromType: data.fromType,
        fromNote: data.fromNote ?? null,
        note: data.note ?? null,
        lines: data.lines,
        operatorUserId: session.user.id,
        operatorName: session.user.name,
      }),
    );
    return ok(shipment);
  } catch (e: any) {
    return fail(e?.message ?? "发货登记失败");
  }
}
