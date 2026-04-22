import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONFIRM_VALUE = "CLEAR_PARTI_DEMO_DATA";

async function countBefore() {
  const [
    users,
    dealers,
    suppliers,
    workshops,
    products,
    salesOrders,
    purchaseOrders,
    workOrders,
    stockMovements,
    stockCounts,
    dealerPayments,
    supplierPayments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.dealer.count(),
    prisma.supplier.count(),
    prisma.workshop.count(),
    prisma.product.count(),
    prisma.salesOrder.count(),
    prisma.purchaseOrder.count(),
    prisma.workOrder.count(),
    prisma.stockMovement.count(),
    prisma.stockCount.count(),
    prisma.dealerPayment.count(),
    prisma.supplierPayment.count(),
  ]);

  return {
    users,
    dealers,
    suppliers,
    workshops,
    products,
    salesOrders,
    purchaseOrders,
    workOrders,
    stockMovements,
    stockCounts,
    dealerPayments,
    supplierPayments,
  };
}

async function main() {
  if (process.env.CLEAR_DEMO_CONFIRM !== CONFIRM_VALUE) {
    throw new Error(
      `Refusing to clear data. Re-run with CLEAR_DEMO_CONFIRM=${CONFIRM_VALUE}`,
    );
  }

  const before = await countBefore();
  console.log("Clearing Parti B2B demo/business data...");
  console.table(before);

  await prisma.$transaction(
    async (tx) => {
      await tx.dealerPaymentAllocation.deleteMany();
      await tx.supplierPaymentAllocation.deleteMany();
      await tx.dealerPayment.deleteMany();
      await tx.supplierPayment.deleteMany();

      await tx.stockMovement.deleteMany();
      await tx.stockCountLine.deleteMany();
      await tx.stockCount.deleteMany();

      await tx.workOrderEvent.deleteMany();
      await tx.workOrder.deleteMany();
      await tx.salesOrderLine.deleteMany();
      await tx.salesOrder.deleteMany();

      await tx.purchaseOrderLine.deleteMany();
      await tx.purchaseOrder.deleteMany();

      await tx.workshopInventory.deleteMany();
      await tx.dealerAddress.deleteMany();
      await tx.dealerContact.deleteMany();
      await tx.supplierContact.deleteMany();

      await tx.user.deleteMany();
      await tx.dealer.deleteMany();
      await tx.supplier.deleteMany();
      await tx.workshop.deleteMany();
      await tx.product.deleteMany();
      await tx.systemSetting.deleteMany();
    },
    { maxWait: 120_000, timeout: 120_000 },
  );

  const after = await countBefore();
  console.log("Demo/business data cleared.");
  console.table(after);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
