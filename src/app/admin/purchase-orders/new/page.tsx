import { prisma } from "@/lib/prisma";
import { NewPOForm } from "./form";

export default async function NewPOPage() {
  const [suppliers, workshops, products] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { supplierNo: "asc" } }),
    prisma.workshop.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    prisma.product.findMany({
      where: { isActive: true, OR: [{ category: "HARDWARE" }, { isRawMaterial: true }] },
      orderBy: [{ isRawMaterial: "desc" }, { sku: "asc" }],
    }),
  ]);

  return (
    <NewPOForm
      suppliers={suppliers.map((s) => ({ id: s.id, supplierNo: s.supplierNo, name: s.name }))}
      workshops={workshops.map((w) => ({ id: w.id, code: w.code, name: w.name }))}
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        productName: p.productName,
        spec: p.spec,
        category: p.category,
        isRawMaterial: p.isRawMaterial,
        purchasePrice: p.purchasePrice != null ? Number(p.purchasePrice) : null,
      }))}
    />
  );
}
