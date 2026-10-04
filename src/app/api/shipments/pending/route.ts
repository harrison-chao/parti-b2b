import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

/** 可发货清单：待发货工单（含外协中/加工中——外协直发场景），行级剩余可发数量 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "WORKSHOP") return fail("无权访问", 403, 403);

  const wos = await prisma.workOrder.findMany({
    where: {
      status: { in: ["PACKING", "READY_TO_SHIP", "PROCESSING", "OUTSOURCING"] },
      ...(role === "WORKSHOP" ? { workshopId: session.user.workshopId! } : {}),
    },
    orderBy: { committedDeliveryDate: "asc" },
    include: {
      order: { include: { dealer: true, lines: { orderBy: { lineNo: "asc" }, include: { shipmentLines: true } } } },
    },
  });

  const pending = wos
    .map((wo) => {
      const lines = wo.order.lines
        .map((l) => {
          const shipped = l.shipmentLines.reduce((s, x) => s + x.quantity, 0);
          return {
            lineId: l.id, lineNo: l.lineNo, sku: l.sku, productName: l.productName,
            quantity: l.quantity, shipped, remaining: l.quantity - shipped,
          };
        })
        .filter((l) => l.remaining > 0);
      return {
        workOrderNo: wo.workOrderNo, orderNo: wo.order.orderNo,
        displayOrderNo: wo.order.displayOrderNo, orderStatus: wo.order.orderStatus,
        woStatus: wo.status,
        customer: wo.order.dealer.nickname || wo.order.dealer.companyName,
        receiverName: wo.order.receiverName, receiverPhone: wo.order.receiverPhone,
        receiverAddress: wo.order.receiverAddress,
        committedDeliveryDate: wo.committedDeliveryDate,
        allowDirectFromOutsourcer: ["PROCESSING", "OUTSOURCING"].includes(wo.status),
        lines,
      };
    })
    .filter((o) => o.lines.length > 0);

  return ok({ pending });
}
