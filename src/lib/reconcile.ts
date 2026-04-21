import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// Order statuses that count as a firm receivable (dealer owes us).
// DRAFT/PENDING/MODIFYING = not yet confirmed; CANCELLED/REJECTED = void.
export const RECEIVABLE_ORDER_STATUSES = [
  "CONFIRMED",
  "PARTIALLY_PAID",
  "PRODUCING",
  "READY",
  "SHIPPED",
  "COMPLETED",
] as const;

const D = (v: Prisma.Decimal | number | string | null | undefined) =>
  v == null ? new Prisma.Decimal(0) : new Prisma.Decimal(v as any);

export type DealerStatement = {
  dealerId: string;
  dealerNo: string;
  companyName: string;
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
        select: { totalAmount: true },
      },
      payments: { select: { amount: true } },
    },
  });
  return dealers.map((d) => {
    const receivable = d.salesOrders.reduce((s, o) => s.add(D(o.totalAmount)), new Prisma.Decimal(0));
    const paid = d.payments.reduce((s, p) => s.add(D(p.amount)), new Prisma.Decimal(0));
    return {
      dealerId: d.id,
      dealerNo: d.dealerNo,
      companyName: d.companyName,
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
      where: { dealerId, orderStatus: { in: RECEIVABLE_ORDER_STATUSES as any } },
      orderBy: { orderDate: "desc" },
      select: {
        orderNo: true, orderDate: true, orderStatus: true, totalAmount: true,
        paidAmount: true, paymentStatus: true,
      },
    }),
    prisma.dealerPayment.findMany({
      where: { dealerId }, orderBy: { paidAt: "desc" },
    }),
  ]);
  const receivable = orders.reduce((s, o) => s.add(D(o.totalAmount)), new Prisma.Decimal(0));
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

export async function listSupplierStatements(): Promise<SupplierStatement[]> {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { supplierNo: "asc" },
    include: {
      purchaseOrders: {
        where: { status: { not: "CANCELLED" } },
        include: { lines: { select: { receivedQty: true, unitPrice: true } } },
      },
      payments: { select: { amount: true } },
    },
  });
  return suppliers.map((s) => {
    let payable = new Prisma.Decimal(0);
    for (const po of s.purchaseOrders) {
      for (const l of po.lines) {
        payable = payable.add(D(l.unitPrice).mul(l.receivedQty));
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
      (s, l) => s.add(D(l.unitPrice).mul(l.receivedQty)),
      new Prisma.Decimal(0),
    );
    const ordered = po.lines.reduce(
      (s, l) => s.add(D(l.unitPrice).mul(l.quantity)),
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
