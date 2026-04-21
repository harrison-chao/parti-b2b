import { prisma } from "@/lib/prisma";
import { SupplierManager } from "./manager";

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { supplierNo: "asc" },
    include: { contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] } },
  });
  return <SupplierManager suppliers={suppliers.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    contacts: s.contacts.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  }))} />;
}
