import type { Prisma, SalesOrder } from "@prisma/client";

type Dealer = { paymentMethod: string; enforcePrepay: boolean };

/**
 * 先款后产守卫（P1-D）。
 * D2 决策口径：内部代下单（createdVia=INTERNAL）款项在系统外沟通，始终不拦；
 * 开关是客户维度（Dealer.enforcePrepay），与单据维度豁免正交——与信用额度检查同构。
 */
export function prepayViolation(
  order: Pick<SalesOrder, "orderNo" | "createdVia" | "paidAmount"> & { confirmedAmount: Prisma.Decimal | null; totalAmount: Prisma.Decimal },
  dealer: Dealer,
  scene: "DISPATCH" | "SHIP",
): string | null {
  if (!dealer.enforcePrepay) return null;
  if (order.createdVia === "INTERNAL") return null;
  const receivable = Number(order.confirmedAmount ?? order.totalAmount);
  if (receivable <= 0) return null;
  if (Number(order.paidAmount) >= receivable) return null;
  const sceneLabel = scene === "DISPATCH" ? "派单" : "发货";
  return `订单 ${order.orderNo} 客户已启用「先款后产」：已收 ¥${Number(order.paidAmount).toFixed(2)} / 应收 ¥${receivable.toFixed(2)}，不能${sceneLabel}。请先在客户对账页登记收款`;
}
