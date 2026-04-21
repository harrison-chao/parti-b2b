import { prisma } from "@/lib/prisma";
import { ProductManager } from "./manager";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: [{ category: "asc" }, { series: "asc" }, { sku: "asc" }],
  });
  return (
    <ProductManager
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        productName: p.productName,
        series: p.series,
        category: p.category,
        lengthMm: p.lengthMm != null ? Number(p.lengthMm) : null,
        spec: p.spec,
        retailPrice: Number(p.retailPrice),
        purchasePrice: p.purchasePrice != null ? Number(p.purchasePrice) : null,
        unit: p.unit,
        drawingRequired: p.drawingRequired,
        isRawMaterial: p.isRawMaterial,
        yieldRate: Number(p.yieldRate),
        isActive: p.isActive,
      }))}
    />
  );
}
