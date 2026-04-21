import { prisma } from "@/lib/prisma";
import type { WorkOrderDetailData } from "@/components/work-order-detail";

export async function loadWorkOrderDetail(workOrderNo: string, opts: { includeDealer: boolean }): Promise<WorkOrderDetailData | null> {
  const wo = await prisma.workOrder.findUnique({
    where: { workOrderNo },
    include: {
      workshop: true,
      order: {
        include: {
          lines: {
            where: { lineType: { not: "OUTSOURCED" } },
            orderBy: { lineNo: "asc" },
          },
          dealer: opts.includeDealer,
        },
      },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!wo) return null;
  return {
    workOrderNo: wo.workOrderNo,
    status: wo.status,
    qcRequired: wo.qcRequired,
    committedDeliveryDate: wo.committedDeliveryDate?.toISOString() ?? null,
    actualShippedAt: wo.actualShippedAt?.toISOString() ?? null,
    carrier: wo.carrier,
    trackingNo: wo.trackingNo,
    currentNote: wo.currentNote,
    delayReason: wo.delayReason,
    assignedBy: wo.assignedBy,
    assignedAt: wo.assignedAt.toISOString(),
    createdAt: wo.createdAt.toISOString(),
    printedAt: wo.printedAt?.toISOString() ?? null,
    workshop: { code: wo.workshop.code, name: wo.workshop.name },
    order: {
      orderNo: wo.order.orderNo,
      orderDate: wo.order.orderDate.toISOString(),
      targetDeliveryDate: wo.order.targetDeliveryDate.toISOString(),
      receiverName: wo.order.receiverName,
      receiverPhone: wo.order.receiverPhone,
      receiverAddress: wo.order.receiverAddress,
      remark: wo.order.remark,
      dealer: opts.includeDealer && (wo.order as any).dealer
        ? { companyName: (wo.order as any).dealer.companyName, dealerNo: (wo.order as any).dealer.dealerNo }
        : null,
      lines: wo.order.lines.map((l) => ({
        lineNo: l.lineNo,
        productName: l.productName,
        sku: l.sku,
        quantity: l.quantity,
        preprocessing: l.preprocessing,
        surfaceTreatment: l.surfaceTreatment,
        drawingUrl: l.drawingUrl,
        drawingFileName: l.drawingFileName,
      })),
    },
    events: wo.events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      operatorName: e.operatorName,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
