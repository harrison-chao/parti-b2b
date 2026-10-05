import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// Order statuses that count as a firm receivable (dealer owes us).
// DRAFT/PENDING/MODIFYING = not yet confirmed; CANCELLED/REJECTED = void.
// PARTIALLY_SHIPPED 必须在内：货已发一部分正是最需要挂应收的时点。
export const RECEIVABLE_ORDER_STATUSES = [
  "CONFIRMED",
  "PARTIALLY_PAID",
  "PRODUCING",
  "READY",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
  "COMPLETED",
] as const;

const D = (v: Prisma.Decimal | number | string | null | undefined) =>
  v == null ? new Prisma.Decimal(0) : new Prisma.Decimal(v as any);

// 应收口径：审单确认金额优先，未确认为下单金额——与收款核销(dealer-payments)保持同一口径
const receivableAmount = (o: { totalAmount: Prisma.Decimal; confirmedAmount?: Prisma.Decimal | null }) =>
  o.confirmedAmount != null ? D(o.confirmedAmount) : D(o.totalAmount);

export type DealerStatement = {
  dealerId: string;
  dealerNo: string;
  companyName: string;
  customerType: "DEALER" | "WALK_IN";
  nickname: string | null;
  receivable: string; // sum of firm orders
  paid: string;       // sum of payments
  balance: string;    // receivable - paid (positive = dealer owes)
  orderCount: number;
  paymentCount: number;
};

export async function listDealerStatements(): Promise<DealerStatement[]> {
  const dealers = await prisma.dealer.findMany({
    orderBy: { dealerNo: "asc" },
    include: {
      salesOrders: {
        where: { orderStatus: { in: RECEIVABLE_ORDER_STATUSES as any } },
        select: { totalAmount: true, confirmedAmount: true },
      },
      payments: { select: { amount: true } },
    },
  });
  return dealers.map((d) => {
    const receivable = d.salesOrders.reduce((s, o) => s.add(receivableAmount(o)), new Prisma.Decimal(0));
    const paid = d.payments.reduce((s, p) => s.add(D(p.amount)), new Prisma.Decimal(0));
    return {
      dealerId: d.id,
      dealerNo: d.dealerNo,
      companyName: d.companyName,
      customerType: d.customerType,
      nickname: d.nickname,
      receivable: receivable.toFixed(2),
      paid: paid.toFixed(2),
      balance: receivable.sub(paid).toFixed(2),
      orderCount: d.salesOrders.length,
      paymentCount: d.payments.length,
    };
  });
}

export async function getDealerStatementDetail(dealerId: string) {
  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!dealer) return null;
  const [orders, payments] = await Promise.all([
    prisma.salesOrder.findMany({
      // legacyBaseNo 过滤：126 张 0 元迁移单不进对账明细（金额贡献为 0，纯展示净化）
      where: { dealerId, legacyBaseNo: null, orderStatus: { in: RECEIVABLE_ORDER_STATUSES as any } },
      orderBy: { orderDate: "desc" },
      select: {
        orderNo: true, displayOrderNo: true, orderDate: true, orderStatus: true, totalAmount: true, confirmedAmount: true,
        paidAmount: true, paymentStatus: true,
        lines: { select: { quantity: true }, orderBy: { lineNo: "asc" } },
      },
    }),
    prisma.dealerPayment.findMany({
      where: { dealerId }, orderBy: { paidAt: "desc" },
      include: { allocations: { select: { orderNo: true, amount: true } } },
    }),
  ]);
  const receivable = orders.reduce((s, o) => s.add(receivableAmount(o)), new Prisma.Decimal(0));
  const paid = payments.reduce((s, p) => s.add(D(p.amount)), new Prisma.Decimal(0));
  return {
    dealer,
    orders,
    payments,
    receivable: receivable.toFixed(2),
    paid: paid.toFixed(2),
    balance: receivable.sub(paid).toFixed(2),
  };
}

export type SupplierStatement = {
  supplierId: string;
  supplierNo: string;
  name: string;
  payable: string; // sum of received value across all non-cancelled POs
  paid: string;
  balance: string; // payable - paid (positive = we owe supplier)
  poCount: number;
  paymentCount: number;
};

/** PO 行应付（KG 行=结算单价×实收磅重；BAR 行=单价×实收根数）。对账与核销共用，禁止两处各写一份。 */
export function linePayableOf(l: { pricingUnit?: string | null; settleUnitPrice?: Prisma.Decimal | number | string | null; receivedWeightKg?: Prisma.Decimal | number | string | null; unitPrice: Prisma.Decimal | number | string; receivedQty: number }) {
  return l.pricingUnit === "KG" && l.settleUnitPrice != null && l.receivedWeightKg != null
    ? D(l.settleUnitPrice).mul(l.receivedWeightKg)
    : D(l.unitPrice).mul(l.receivedQty);
}

export async function listSupplierStatements(): Promise<SupplierStatement[]> {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { supplierNo: "asc" },
    include: {
      purchaseOrders: {
        where: { status: { not: "CANCELLED" } },
        include: { lines: { select: { receivedQty: true, unitPrice: true, pricingUnit: true, settleUnitPrice: true, receivedWeightKg: true } } },
      },
      payments: { select: { amount: true } },
    },
  });
  return suppliers.map((s) => {
    let payable = new Prisma.Decimal(0);
    for (const po of s.purchaseOrders) {
      for (const l of po.lines) {
        // 按重量结算行：应付 = 结算单价 × 实收磅重（批次计价第 2 步）
        payable = payable.add(linePayableOf(l));
      }
    }
    const paid = s.payments.reduce((acc, p) => acc.add(D(p.amount)), new Prisma.Decimal(0));
    return {
      supplierId: s.id,
      supplierNo: s.supplierNo,
      name: s.name,
      payable: payable.toFixed(2),
      paid: paid.toFixed(2),
      balance: payable.sub(paid).toFixed(2),
      poCount: s.purchaseOrders.length,
      paymentCount: s.payments.length,
    };
  });
}

export async function getSupplierStatementDetail(supplierId: string) {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return null;
  const [pos, payments] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { supplierId, status: { not: "CANCELLED" } },
      orderBy: { orderDate: "desc" },
      include: { lines: true, workshop: { select: { name: true } } },
    }),
    prisma.supplierPayment.findMany({ where: { supplierId }, orderBy: { paidAt: "desc" } }),
  ]);

  const poRows = pos.map((po) => {
    const received = po.lines.reduce(
      (s, l) => s.add(linePayableOf(l)),
      new Prisma.Decimal(0),
    );
    // KG 行下单额即 lineAmount（约重×结算单价）
    const ordered = po.lines.reduce(
      (s, l) => s.add(l.pricingUnit === "KG" ? D(l.lineAmount) : D(l.unitPrice).mul(l.quantity)),
      new Prisma.Decimal(0),
    );
    return {
      poNo: po.poNo,
      status: po.status,
      workshopName: po.workshop.name,
      orderDate: po.orderDate,
      orderedAmount: ordered.toFixed(2),
      receivedAmount: received.toFixed(2),
      paidAmount: D(po.paidAmount).toFixed(2),
      unpaidAmount: received.sub(D(po.paidAmount)).toFixed(2),
    };
  });
  const payable = poRows.reduce((s, r) => s.add(new Prisma.Decimal(r.receivedAmount)), new Prisma.Decimal(0));
  const paid = payments.reduce((s, p) => s.add(D(p.amount)), new Prisma.Decimal(0));
  return {
    supplier,
    pos: poRows,
    payments,
    payable: payable.toFixed(2),
    paid: paid.toFixed(2),
    balance: payable.sub(paid).toFixed(2),
  };
}
