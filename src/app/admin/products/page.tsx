import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings";
import { ProductManager } from "./manager";

export default async function ProductsPage() {
  const [products, settings] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ category: "asc" }, { series: "asc" }, { sku: "asc" }],
    }),
    loadSettings(),
  ]);
  return (
    <ProductManager
      surfaceProcessOptions={settings.surfaceProcesses}
      surfaceColorOptions={settings.surfaceColors}
      products={products.map((p) => ({
        id: p.id,
        sku: p.sku,
        productName: p.productName,
        series: p.series,
        category: p.category,
        lengthMm: p.lengthMm != null ? Number(p.lengthMm) : null,
        spec: p.spec,
        surfaceProcessCode: p.surfaceProcessCode,
        surfaceColorCode: p.surfaceColorCode,
        weightPerMeter: p.weightPerMeter != null ? Number(p.weightPerMeter) : null,
        materialStage: p.materialStage,
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
