/**
 * W3b: 工单状态机穷举矩阵测试（纯函数层，无需 DB）。
 * 校验 src/lib/workorder.ts 的转移表、快捷推进、QC 门控与销售单状态映射。
 */
import {
  WORK_ORDER_FLOW, WORK_ORDER_TRANSITIONS,
  nextWorkOrderStatus, isNextWorkOrderStatus, salesOrderStatusFor,
} from "../src/lib/workorder";
import type { WorkOrderStatus } from "@prisma/client";

let pass = 0, fail = 0;
const check = (label: string, ok: boolean, detail?: unknown) => { if (ok) { pass++; console.log(`✓ ${label}`); } else { fail++; console.log(`✗ ${label}${detail !== undefined ? " — " + String(detail) : ""}`); } };

// 1. 期望矩阵（PRD v0.2 §5）
const EXPECTED: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  PENDING_START: ["PROCESSING"],
  PROCESSING: ["OUTSOURCING", "QC", "PACKING"],
  OUTSOURCING: ["PROCESSING", "PACKING"],
  QC: ["PACKING"],
  PACKING: ["READY_TO_SHIP"],
  READY_TO_SHIP: ["SHIPPED"],
  SHIPPED: [],
  // CANCELLED 不走正常流转（订单取消专用端点联动），无出边
  CANCELLED: [],
};
for (const from of WORK_ORDER_FLOW) {
  check(`transitions[${from}]`, JSON.stringify(WORK_ORDER_TRANSITIONS[from] ?? []) === JSON.stringify(EXPECTED[from]));
  for (const to of WORK_ORDER_FLOW) {
    const qc = to === "QC";
    check(`${from}→${to} (qc=${qc})`, isNextWorkOrderStatus(from, to, true) === EXPECTED[from].includes(to));
  }
}

// 2. QC 门控：qcRequired=false 时 PROCESSING→QC 必须拒绝
check("PROCESSING→QC rejected when qcRequired=false", !isNextWorkOrderStatus("PROCESSING", "QC", false));
check("PROCESSING→PACKING allowed when qcRequired=false", isNextWorkOrderStatus("PROCESSING", "PACKING", false));

// 3. 快捷推进默认路径
const NEXT: [WorkOrderStatus, boolean, WorkOrderStatus | null][] = [
  ["PENDING_START", true, "PROCESSING"],
  ["PENDING_START", false, "PROCESSING"],
  ["PROCESSING", true, "QC"],
  ["PROCESSING", false, "PACKING"],
  ["OUTSOURCING", true, "PACKING"],
  ["OUTSOURCING", false, "PACKING"],
  ["QC", true, "PACKING"],
  ["PACKING", false, "READY_TO_SHIP"],
  ["READY_TO_SHIP", false, "SHIPPED"],
  ["SHIPPED", false, null],
];
for (const [from, qc, want] of NEXT) check(`next(${from}, qc=${qc}) = ${want}`, nextWorkOrderStatus(from, qc) === want);

// 4. 销售单状态映射（PACKING 仍是扣库存节点=生产中；READY_TO_SHIP=待发；SHIPPED=已发）
for (const s of ["PENDING_START", "PROCESSING", "OUTSOURCING", "QC", "PACKING"] as WorkOrderStatus[]) {
  check(`salesOrderStatusFor(${s}) = PRODUCING`, salesOrderStatusFor(s) === "PRODUCING");
}
check("salesOrderStatusFor(READY_TO_SHIP) = READY", salesOrderStatusFor("READY_TO_SHIP") === "READY");
check("salesOrderStatusFor(SHIPPED) = SHIPPED", salesOrderStatusFor("SHIPPED") === "SHIPPED");

// 5. 无死锁：除 SHIPPED 外每个状态至少一个出边；除 PENDING_START 外可达（反向可达性）
const reachable = new Set<WorkOrderStatus>(["PENDING_START"]);
let grew = true;
while (grew) {
  grew = false;
  for (const from of WORK_ORDER_FLOW) {
    if (!reachable.has(from)) continue;
    for (const to of WORK_ORDER_TRANSITIONS[from]) {
      if (!reachable.has(to)) { reachable.add(to); grew = true; }
    }
  }
}
check("all statuses reachable from PENDING_START", reachable.size === WORK_ORDER_FLOW.length, [...reachable].join(","));

console.log(`\n矩阵测试: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
