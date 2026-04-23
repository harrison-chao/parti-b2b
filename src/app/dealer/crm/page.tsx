import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CrmManager } from "./crm-manager";

export const dynamic = "force-dynamic";

export default async function DealerCrmPage() {
  const session = await auth();
  const dealerId = session!.user.dealerId!;
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const [customers, todayTasks, overdueTasks] = await Promise.all([
    prisma.crmCustomer.findMany({
      where: { dealerId },
      orderBy: [{ nextFollowAt: "asc" }, { updatedAt: "desc" }],
      include: {
        _count: { select: { contactLogs: true, opportunities: true, tasks: true, salesOrders: true } },
      },
    }),
    prisma.crmTask.findMany({
      where: { dealerId, status: "PENDING", dueAt: { lte: today } },
      orderBy: { dueAt: "asc" },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      take: 8,
    }),
    prisma.crmTask.count({
      where: { dealerId, status: "PENDING", dueAt: { lt: new Date() } },
    }),
  ]);

  return (
    <CrmManager
      initialCustomers={customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        customerType: customer.customerType,
        stage: customer.stage,
        intentLevel: customer.intentLevel,
        budget: customer.budget != null ? Number(customer.budget) : null,
        demand: customer.demand,
        source: customer.source,
        tags: customer.tags,
        nextFollowAt: customer.nextFollowAt?.toISOString() ?? null,
        lastContactAt: customer.lastContactAt?.toISOString() ?? null,
        updatedAt: customer.updatedAt.toISOString(),
        counts: customer._count,
      }))}
      todayTasks={todayTasks.map((task) => ({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt.toISOString(),
        customer: task.customer,
      }))}
      overdueTasks={overdueTasks}
    />
  );
}
