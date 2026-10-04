import type { WorkOrderStatus, OrderStatus } from "@prisma/client";

/**
 * W1/D3 状态机（2026-10 与 Base 实证对齐）：
 *   PENDING_START(待开工) → PROCESSING(加工中) → [OUTSOURCING(外协中) ↔] → [QC 可选] → PACKING(打包/扣库存) → READY_TO_SHIP(待发货) → SHIPPED(已发货)
 *
 * 规则：
 * - SCHEDULED+PREPARING 合并为 PENDING_START（排产即待开工，无独立备料态）
 * - OUTSOURCING 可回 PROCESSING（外协回厂继续加工）或直达 PACKING（外协回来直接打包，≤2 点按）
 * - QC 仅 qcRequired=true 时可进入；跳过时 PROCESSING 直达 PACKING
 * - PACKING 保持为库存扣减节点（幂等逻辑不动）
 */
export const WORK_ORDER_FLOW: WorkOrderStatus[] = [
  "PENDING_START",
  "PROCESSING",
  "OUTSOURCING",
  "QC",
  "PACKING",
  "READY_TO_SHIP",
  "SHIPPED",
];

/** 允许的状态转移表（有向）。CANCELLED 由订单取消专用端点联动写入，不属于正常流转（无出边）。 */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  PENDING_START: ["PROCESSING"],
  PROCESSING: ["OUTSOURCING", "QC", "PACKING"],
  OUTSOURCING: ["PROCESSING", "PACKING"],
  QC: ["PACKING"],
  PACKING: ["READY_TO_SHIP"],
  READY_TO_SHIP: ["SHIPPED"],
  SHIPPED: [],
  CANCELLED: [],
};

/** "推进"快捷动作的默认下一态（车间一键走最常见路径） */
export function nextWorkOrderStatus(current: WorkOrderStatus, qcRequired: boolean): WorkOrderStatus | null {
  switch (current) {
    case "PENDING_START":
      return "PROCESSING";
    case "PROCESSING":
      return qcRequired ? "QC" : "PACKING";
    case "OUTSOURCING":
      return "PACKING";
    case "QC":
      return "PACKING";
    case "PACKING":
      return "READY_TO_SHIP";
    case "READY_TO_SHIP":
      return "SHIPPED";
    case "SHIPPED":
    case "CANCELLED":
      return null;
  }
}

/** 目标态是否为当前态的合法下一跳（qcRequired=false 时禁入 QC） */
export function isNextWorkOrderStatus(current: WorkOrderStatus, target: WorkOrderStatus, qcRequired: boolean): boolean {
  const allowed = WORK_ORDER_TRANSITIONS[current] ?? [];
  if (!allowed.includes(target)) return false;
  if (target === "QC" && !qcRequired) return false;
  return true;
}

export function salesOrderStatusFor(ws: WorkOrderStatus): OrderStatus {
  switch (ws) {
    case "PENDING_START":
    case "PROCESSING":
    case "OUTSOURCING":
    case "QC":
    case "PACKING":
      return "PRODUCING";
    case "READY_TO_SHIP":
      return "READY";
    case "SHIPPED":
      return "SHIPPED";
    case "CANCELLED":
      return "CANCELLED";
  }
}
