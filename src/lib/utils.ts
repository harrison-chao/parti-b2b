import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return "¥0.00";
  const num = typeof n === "string" ? parseFloat(n) : n;
  return "¥" + num.toFixed(2);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("zh-CN");
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("zh-CN");
}

export function genOrderNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const r = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `SO-${y}${m}${day}-${r}`;
}

export function genWorkOrderNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const r = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `WO-${y}${m}${day}-${r}`;
}

export function genPoNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const r = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `PO-${y}${m}${day}-${r}`;
}

export function genStockCountNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const r = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `SC-${y}${m}${day}-${r}`;
}

export const PURCHASE_ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  SENT: "已下单",
  PARTIALLY_RECEIVED: "部分收货",
  RECEIVED: "已收货",
  CLOSED: "已关闭",
  CANCELLED: "已取消",
};

export const PURCHASE_ORDER_STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-secondary text-foreground/80",
  SENT: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/20",
  PARTIALLY_RECEIVED: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/20",
  RECEIVED: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
  CLOSED: "bg-slate-500/15 text-slate-400 ring-1 ring-inset ring-slate-400/20",
  CANCELLED: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/20",
};

export const STOCK_MOVEMENT_TYPE_LABEL: Record<string, string> = {
  PO_RECEIPT: "采购入库",
  WORK_ORDER_CONSUME: "工单消耗",
  STOCK_COUNT_ADJUST: "盘点调整",
  MANUAL_ADJUST: "手工调整",
};

export const STOCK_COUNT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "已提交",
  APPROVED: "已审核",
  CANCELLED: "已取消",
};

export const PRODUCT_CATEGORY_LABEL: Record<string, string> = {
  PROFILE: "型材",
  HARDWARE: "零配件",
};

export const ORDER_LINE_TYPE_LABEL: Record<string, string> = {
  PROFILE: "型材",
  HARDWARE: "零配件",
  OUTSOURCED: "外购",
};

export const ORDER_LINE_TYPE_COLOR: Record<string, string> = {
  PROFILE: "bg-sky-100 text-sky-700",
  HARDWARE: "bg-violet-100 text-violet-700",
  OUTSOURCED: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/20",
};

export const WORK_ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_START: "待开工",
  PROCESSING: "加工中",
  OUTSOURCING: "外协中",
  QC: "质检中",
  PACKING: "打包中",
  READY_TO_SHIP: "待发货",
  SHIPPED: "已发货",
  CANCELLED: "已取消",
};

export const WORK_ORDER_STATUS_COLOR: Record<string, string> = {
  CANCELLED: "bg-zinc-500/15 text-zinc-400 ring-1 ring-inset ring-zinc-400/20",
  PENDING_START: "bg-slate-500/15 text-slate-300 ring-1 ring-inset ring-slate-400/20",
  PROCESSING: "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-400/20",
  OUTSOURCING: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/20",
  QC: "bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-inset ring-fuchsia-400/20",
  PACKING: "bg-purple-500/15 text-purple-300 ring-1 ring-inset ring-purple-400/20",
  READY_TO_SHIP: "bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-400/20",
  SHIPPED: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
};

// 单一来源：状态流转以 src/lib/workorder.ts 为准（W3b 收口，消除三处重复定义）
export { WORK_ORDER_FLOW as WORK_ORDER_STATUS_FLOW } from "./workorder";

export const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  PENDING: "待审核",
  MODIFYING: "待确认",
  CONFIRMED: "已确认",
  PARTIALLY_PAID: "部分付款",
  PRODUCING: "生产中",
  READY: "待发货",
  PARTIALLY_SHIPPED: "部分发货",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REJECTED: "已驳回",
};

export const ORDER_STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-slate-500/15 text-slate-300 ring-1 ring-inset ring-slate-400/20",
  PENDING: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/20",
  MODIFYING: "bg-orange-500/15 text-orange-300 ring-1 ring-inset ring-orange-400/20",
  CONFIRMED: "bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-400/20",
  PARTIALLY_PAID: "bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-400/20",
  PRODUCING: "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-400/20",
  READY: "bg-purple-500/15 text-purple-300 ring-1 ring-inset ring-purple-400/20",
  PARTIALLY_SHIPPED: "bg-teal-500/15 text-teal-300 ring-1 ring-inset ring-teal-400/20",
  SHIPPED: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/20",
  COMPLETED: "bg-green-500/15 text-green-300 ring-1 ring-inset ring-green-400/20",
  CANCELLED: "bg-slate-500/15 text-slate-300 ring-1 ring-inset ring-slate-400/20",
  REJECTED: "bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-400/20",
};

export const CRM_CUSTOMER_STAGE_LABEL: Record<string, string> = {
  LEAD: "线索",
  POTENTIAL: "潜客",
  QUOTED: "已报价",
  DEAL: "已成交",
  LOST: "战败/流失",
};

export const CRM_CUSTOMER_STAGE_COLOR: Record<string, string> = {
  LEAD: "bg-slate-500/15 text-slate-300 ring-1 ring-inset ring-slate-400/20",
  POTENTIAL: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/20",
  QUOTED: "bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-400/20",
  DEAL: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
  LOST: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/20",
};

export const CRM_CUSTOMER_TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: "个人业主",
  COMPANY: "公司/装企",
  DESIGNER: "设计师",
  CONTRACTOR: "工装总包",
};

export const CRM_INTENT_LEVEL_LABEL: Record<string, string> = {
  HIGH: "高意向",
  MEDIUM: "中意向",
  LOW: "低意向",
};

export const CRM_CONTACT_METHOD_LABEL: Record<string, string> = {
  PHONE: "电话",
  WECHAT: "微信",
  VISIT: "到店",
  ONSITE: "上门",
  MEETING: "会议",
  OTHER: "其他",
};

export const CRM_OPPORTUNITY_STAGE_LABEL: Record<string, string> = {
  DISCOVERY: "需求沟通",
  PROPOSAL: "出方案/报价",
  NEGOTIATION: "谈判",
  WON: "赢单",
  LOST: "输单",
};

export const CRM_TASK_STATUS_LABEL: Record<string, string> = {
  PENDING: "待办",
  DONE: "已完成",
  CANCELLED: "已取消",
};

export function genShipmentNo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const r = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `SH-${y}${m}${day}-${r}`;
}
