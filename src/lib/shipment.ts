import { PrismaClient, Prisma, SalesOrderLine, WorkOrderStatus } from "@prisma/client";
import { genShipmentNo } from "@/lib/utils";
import { consumeWorkOrderMaterials } from "@/lib/stock-consume";

type Tx = Prisma.TransactionClient | PrismaClient;

export type ShipmentLineInput = { orderNo: string; lineId: string; quantity: number };
export type CreateShipmentInput = {
  carrier: string;
  trackingNo?: string | null;
  shippedAt?: Date;
  freightPayType?: "PREPAID" | "COD" | "MONTHLY";
  fromType?: "FACTORY" | "OUTSOURCER";
  fromNote?: string | null;
  note?: string | null;
  lines: ShipmentLineInput[];
  operatorUserId?: string | null;
  operatorName?: string | null;
};

export async function shippedQtyByLine(tx: Tx, lineIds: string[]): Promise<Map<string, number>> {
  if (!lineIds.length) return new Map();
  const rows = await tx.shipmentLine.groupBy({
    by: ["lineId"],
    where: { lineId: { in: lineIds } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.lineId, r._sum.quantity ?? 0]));
}

/** 校验并创建发货单：多单合发 / 行级部分数量 / 到付 / 外协直发。
 *  全部行发完 → 订单 SHIPPED + 工单 SHIPPED（含物流回写与事件）；
 *  部分发出 → 订单 PARTIALLY_SHIPPED。
 *  外协直发（fromType=OUTSOURCER）允许工单仍处加工/外协态时发货。 */
export async function createShipment(tx: Tx, input: CreateShipmentInput) {
  if (!input.lines.length) throw new Error("发货明细不能为空");
  for (const l of input.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error("发货数量必须为正整数");
  }
  if (!input.carrier?.trim()) throw new Error("承运商必填");

  const lineIds = input.lines.map((l) => l.lineId);
  const lines = await tx.salesOrderLine.findMany({ where: { id: { in: lineIds } }, include: { order: true } });
  const lineMap = new Map(lines.map((l) => [l.id, l]));
  for (const l of input.lines) {
    const line = lineMap.get(l.lineId);
    if (!line) throw new Error(`发货行不存在: ${l.lineId}`);
    if (line.orderNo !== l.orderNo) throw new Error(`发货行 ${line.sku} 不属于订单 ${l.orderNo}`);
    if (line.order.orderStatus === "CANCELLED" || line.order.orderStatus === "REJECTED") throw new Error(`订单 ${l.orderNo} 已取消，不能发货`);
  }

  // 数量结余校验
  const shipped = await shippedQtyByLine(tx, lineIds);
  for (const l of input.lines) {
    const line = lineMap.get(l.lineId)!;
    const already = shipped.get(l.lineId) ?? 0;
    const remaining = line.quantity - already;
    if (l.quantity > remaining) {
      throw new Error(`${line.sku} 发货超量：剩余可发 ${remaining}，本次 ${l.quantity}`);
    }
  }

  // 工单状态门槛：READY_TO_SHIP（或外协直发豁免）
  const orderNos = [...new Set(input.lines.map((l) => l.orderNo))];
  const workOrders = await tx.workOrder.findMany({ where: { orderNo: { in: orderNos } } });
  const woByOrder = new Map(workOrders.map((w) => [w.orderNo, w]));
  for (const orderNo of orderNos) {
    const wo = woByOrder.get(orderNo);
    if (!wo) continue; // 无工单（如纯外购单）直接允许
    const okStates: WorkOrderStatus[] = input.fromType === "OUTSOURCER"
      ? ["PROCESSING", "OUTSOURCING", "PACKING", "READY_TO_SHIP"]
      : ["READY_TO_SHIP"];
    if (!okStates.includes(wo.status)) throw new Error(`订单 ${orderNo} 工单状态 ${wo.status} 不可发货（需待发货；外协直发除外）`);
  }

  const shipmentNo = genShipmentNo();
  const shippedAt = input.shippedAt ?? new Date();

  const shipment = await tx.shipment.create({
    data: {
      shipmentNo,
      carrier: input.carrier.trim(),
      trackingNo: input.trackingNo?.trim() || null,
      shippedAt,
      freightPayType: input.freightPayType ?? "PREPAID",
      fromType: input.fromType ?? "FACTORY",
      fromNote: input.fromNote ?? null,
      note: input.note ?? null,
      createdByUserId: input.operatorUserId ?? null,
      createdByName: input.operatorName ?? null,
      lines: { create: input.lines.map((l) => ({ orderNo: l.orderNo, lineId: l.lineId, quantity: l.quantity })) },
    },
    include: { lines: true },
  });

  // 每个受影响订单：判断是否全部行发完
  for (const orderNo of orderNos) {
    // 外协直发：工单不经过 PACKING，发货时补扣原料（幂等，已扣过则跳过）
    const woForConsume = woByOrder.get(orderNo);
    if (input.fromType === "OUTSOURCER" && woForConsume && woForConsume.status !== "SHIPPED") {
      await consumeWorkOrderMaterials(tx, {
        workOrderNo: woForConsume.workOrderNo,
        orderNo,
        workshopId: woForConsume.workshopId,
        note: `外协直发 ${shipmentNo} 补扣`,
        operatorName: input.operatorName,
      });
    }
    const order = await tx.salesOrder.findUniqueOrThrow({ where: { orderNo }, include: { lines: true } });
    // 外购行（OUTSOURCED）随单交付、不做数量追踪，不阻塞发货完成判定
    const trackable = (order.lines as SalesOrderLine[]).filter((l) => l.lineType !== "OUTSOURCED");
    const nowShipped = await shippedQtyByLine(tx, trackable.map((l) => l.id));
    const fullyShipped = trackable.every((l) => (nowShipped.get(l.id) ?? 0) >= l.quantity);
    const anyShipped = trackable.some((l) => (nowShipped.get(l.id) ?? 0) > 0);

    if (fullyShipped) {
      await tx.salesOrder.update({
        where: { orderNo },
        data: { orderStatus: "SHIPPED", actualDeliveryDate: shippedAt, logisticsNo: shipment.trackingNo ?? undefined },
      });
      const wo = woByOrder.get(orderNo);
      if (wo && wo.status !== "SHIPPED") {
        await tx.workOrder.update({
          where: { id: wo.id },
          data: { status: "SHIPPED", actualShippedAt: shippedAt, carrier: shipment.carrier, trackingNo: shipment.trackingNo },
        });
        await tx.workOrderEvent.create({
          data: {
            workOrderId: wo.id, fromStatus: wo.status, toStatus: "SHIPPED",
            note: `发货 ${shipment.shipmentNo}（${shipment.carrier}${shipment.trackingNo ? " " + shipment.trackingNo : ""}${shipment.fromType === "OUTSOURCER" ? "，外协直发" : ""}）`,
            operatorUserId: input.operatorUserId ?? null, operatorName: input.operatorName ?? null,
          },
        });
      }
    } else if (anyShipped) {
      await tx.salesOrder.update({ where: { orderNo }, data: { orderStatus: "PARTIALLY_SHIPPED" } });
    }
  }

  return shipment;
}

/** 全局检索：运单号 / 承运商 / 发货单号 → 命中发货单及其订单 */
export async function searchShipments(tx: Tx, q: string) {
  return tx.shipment.findMany({
    where: {
      OR: [
        { trackingNo: { contains: q, mode: "insensitive" } },
        { shipmentNo: { contains: q, mode: "insensitive" } },
        { carrier: { contains: q } },
      ],
    },
    orderBy: { shippedAt: "desc" },
    take: 20,
    include: { lines: { include: { order: { select: { orderNo: true, displayOrderNo: true, receiverName: true } } } } },
  });
}
