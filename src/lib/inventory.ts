import type { Prisma, PrismaClient, StockMovementType } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Apply a delta to (workshopId, sku) inventory and write a StockMovement row.
 * delta: positive = inbound, negative = outbound. Negative balance is blocked by default.
 * Creates the WorkshopInventory row lazily on first inbound.
 */
export async function applyStockMovement(
  tx: Tx,
  args: {
    workshopId: string;
    sku: string;
    productName: string;
    delta: number;
    type: StockMovementType;
    refType?: string | null;
    refNo?: string | null;
    note?: string | null;
    operatorName?: string | null;
    allowNegative?: boolean;
  },
) {
  const { workshopId, sku, productName, delta, type, refType, refNo, note, operatorName, allowNegative } = args;

  const existing = await tx.workshopInventory.findUnique({
    where: { workshopId_sku: { workshopId, sku } },
  });

  const newQty = (existing?.quantity ?? 0) + delta;
  if (newQty < 0 && !allowNegative) {
    throw new Error(`库存不足：${sku} 当前 ${existing?.quantity ?? 0}，本次变动 ${delta}，将变为 ${newQty}`);
  }

  if (existing) {
    await tx.workshopInventory.update({
      where: { workshopId_sku: { workshopId, sku } },
      data: { quantity: newQty, productName },
    });
  } else {
    await tx.workshopInventory.create({
      data: { workshopId, sku, productName, quantity: newQty },
    });
  }

  await tx.stockMovement.create({
    data: {
      workshopId,
      sku,
      productName,
      type,
      quantity: delta,
      balanceAfter: newQty,
      refType: refType ?? null,
      refNo: refNo ?? null,
      note: note ?? null,
      operatorName: operatorName ?? null,
    },
  });

  return newQty;
}
