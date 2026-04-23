import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { uploadJsonBackup } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertCronOrAdmin(req: NextRequest, session: any) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  const isCron = Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);
  const isAdmin = session?.user.role === "ADMIN";
  return isCron || isAdmin;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!assertCronOrAdmin(req, session)) return fail("Unauthorized", 401, 401);

  const now = new Date();
  const ymd = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[:.]/g, "-");

  const [
    users,
    dealers,
    dealerContacts,
    dealerAddresses,
    workshops,
    suppliers,
    supplierContacts,
    products,
    salesOrders,
    salesOrderLines,
    workOrders,
    workOrderEvents,
    purchaseOrders,
    purchaseOrderLines,
    workshopInventory,
    stockMovements,
    stockCounts,
    stockCountLines,
    dealerPayments,
    dealerPaymentAllocations,
    supplierPayments,
    supplierPaymentAllocations,
    crmCustomers,
    crmContactLogs,
    crmOpportunities,
    crmTasks,
  ] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, dealerId: true, workshopId: true, createdAt: true, updatedAt: true } }),
    prisma.dealer.findMany(),
    prisma.dealerContact.findMany(),
    prisma.dealerAddress.findMany(),
    prisma.workshop.findMany(),
    prisma.supplier.findMany(),
    prisma.supplierContact.findMany(),
    prisma.product.findMany(),
    prisma.salesOrder.findMany(),
    prisma.salesOrderLine.findMany(),
    prisma.workOrder.findMany(),
    prisma.workOrderEvent.findMany(),
    prisma.purchaseOrder.findMany(),
    prisma.purchaseOrderLine.findMany(),
    prisma.workshopInventory.findMany(),
    prisma.stockMovement.findMany(),
    prisma.stockCount.findMany(),
    prisma.stockCountLine.findMany(),
    prisma.dealerPayment.findMany(),
    prisma.dealerPaymentAllocation.findMany(),
    prisma.supplierPayment.findMany(),
    prisma.supplierPaymentAllocation.findMany(),
    prisma.crmCustomer.findMany(),
    prisma.crmContactLog.findMany(),
    prisma.crmOpportunity.findMany(),
    prisma.crmTask.findMany(),
  ]);

  const data = {
    metadata: {
      app: "parti-b2b",
      type: "daily-operational-backup",
      generatedAt: now.toISOString(),
      generatedBy: session?.user.email ?? "vercel-cron",
      excludes: ["User.password"],
      counts: {
        users: users.length,
        dealers: dealers.length,
        workshops: workshops.length,
        suppliers: suppliers.length,
        products: products.length,
        salesOrders: salesOrders.length,
        purchaseOrders: purchaseOrders.length,
        workOrders: workOrders.length,
        stockMovements: stockMovements.length,
        crmCustomers: crmCustomers.length,
      },
    },
    tables: {
      users,
      dealers,
      dealerContacts,
      dealerAddresses,
      workshops,
      suppliers,
      supplierContacts,
      products,
      salesOrders,
      salesOrderLines,
      workOrders,
      workOrderEvents,
      purchaseOrders,
      purchaseOrderLines,
      workshopInventory,
      stockMovements,
      stockCounts,
      stockCountLines,
      dealerPayments,
      dealerPaymentAllocations,
      supplierPayments,
      supplierPaymentAllocations,
      crmCustomers,
      crmContactLogs,
      crmOpportunities,
      crmTasks,
    },
  };

  try {
    const result = await uploadJsonBackup(`daily/${ymd}/${stamp}.json`, data);
    return ok({ ...result, metadata: data.metadata });
  } catch (error: any) {
    return fail(error?.message ?? "备份失败", 500, 500);
  }
}
