import type { WorkOrderStatus, OrderStatus } from "@prisma/client";

export const WORK_ORDER_FLOW: WorkOrderStatus[] = [
  "SCHEDULED",
  "PREPARING",
  "PROCESSING",
  "QC",
  "PACKING",
  "READY_TO_SHIP",
  "SHIPPED",
];

export function nextWorkOrderStatus(current: WorkOrderStatus, qcRequired: boolean): WorkOrderStatus | null {
  const flow = qcRequired ? WORK_ORDER_FLOW : WORK_ORDER_FLOW.filter((s) => s !== "QC");
  const i = flow.indexOf(current);
  if (i < 0 || i === flow.length - 1) return null;
  return flow[i + 1];
}

export function isNextWorkOrderStatus(current: WorkOrderStatus, target: WorkOrderStatus, qcRequired: boolean): boolean {
  return nextWorkOrderStatus(current, qcRequired) === target;
}

export function salesOrderStatusFor(ws: WorkOrderStatus): OrderStatus {
  switch (ws) {
    case "SCHEDULED":
    case "PREPARING":
    case "PROCESSING":
    case "QC":
    case "PACKING":
      return "PRODUCING";
    case "READY_TO_SHIP":
      return "READY";
    case "SHIPPED":
      return "SHIPPED";
  }
}
