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
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-blue-100 text-blue-800",
  PARTIALLY_RECEIVED: "bg-amber-100 text-amber-800",
  RECEIVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-slate-200 text-slate-600",
  CANCELLED: "bg-rose-100 text-rose-800",
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
  OUTSOURCED: "bg-amber-100 text-amber-700",
};

export const WORK_ORDER_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "已排产",
  PREPARING: "备料中",
  PROCESSING: "加工中",
  QC: "质检中",
  PACKING: "打包中",
  READY_TO_SHIP: "待出仓",
  SHIPPED: "已出运",
};

export const WORK_ORDER_STATUS_COLOR: Record<string, string> = {
  SCHEDULED: "bg-slate-100 text-slate-700",
  PREPARING: "bg-amber-100 text-amber-700",
  PROCESSING: "bg-indigo-100 text-indigo-700",
  QC: "bg-fuchsia-100 text-fuchsia-700",
  PACKING: "bg-purple-100 text-purple-700",
  READY_TO_SHIP: "bg-cyan-100 text-cyan-700",
  SHIPPED: "bg-emerald-100 text-emerald-700",
};

export const WORK_ORDER_STATUS_FLOW: string[] = [
  "SCHEDULED",
  "PREPARING",
  "PROCESSING",
  "QC",
  "PACKING",
  "READY_TO_SHIP",
  "SHIPPED",
];

export const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  PENDING: "待审核",
  MODIFYING: "待确认",
  CONFIRMED: "已确认",
  PARTIALLY_PAID: "部分付款",
  PRODUCING: "生产中",
  READY: "待发货",
  SHIPPED: "已发货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  REJECTED: "已驳回",
};

export const ORDER_STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING: "bg-amber-100 text-amber-700",
  MODIFYING: "bg-orange-100 text-orange-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PARTIALLY_PAID: "bg-cyan-100 text-cyan-700",
  PRODUCING: "bg-indigo-100 text-indigo-700",
  READY: "bg-purple-100 text-purple-700",
  SHIPPED: "bg-sky-100 text-sky-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-200 text-gray-600",
  REJECTED: "bg-red-100 text-red-700",
};
