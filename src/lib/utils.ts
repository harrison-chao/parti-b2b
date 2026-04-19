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
