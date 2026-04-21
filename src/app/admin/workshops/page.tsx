import { prisma } from "@/lib/prisma";
import { WorkshopsManager } from "./manager";

export default async function AdminWorkshopsPage() {
  const workshops = await prisma.workshop.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { workOrders: true, users: true } },
      users: { select: { id: true, email: true, name: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  });
  const plain = workshops.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    contactName: w.contactName,
    contactPhone: w.contactPhone,
    address: w.address,
    isActive: w.isActive,
    workOrderCount: w._count.workOrders,
    userCount: w._count.users,
    users: w.users.map((u) => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt.toISOString() })),
    createdAt: w.createdAt.toISOString(),
  }));
  return <WorkshopsManager initial={plain} />;
}
