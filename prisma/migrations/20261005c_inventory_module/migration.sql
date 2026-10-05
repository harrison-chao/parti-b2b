-- 库存模块完整化：调拨/余段回库流水类型 + 炉批号 + 调拨单模型
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "StockMovementType" ADD VALUE 'PRODUCTION_RETURN';
ALTER TABLE "StockMovement" ADD COLUMN "batchNo" TEXT;

CREATE TABLE "TransferOrder" (
    "id" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "fromWorkshopId" TEXT NOT NULL,
    "toWorkshopId" TEXT NOT NULL,
    "note" TEXT,
    "operatorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransferOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransferLine" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "TransferLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransferOrder_transferNo_key" ON "TransferOrder"("transferNo");
CREATE INDEX "TransferOrder_fromWorkshopId_idx" ON "TransferOrder"("fromWorkshopId");
CREATE INDEX "TransferOrder_toWorkshopId_idx" ON "TransferOrder"("toWorkshopId");
CREATE INDEX "TransferLine_transferId_idx" ON "TransferLine"("transferId");

ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_fromWorkshopId_fkey" FOREIGN KEY ("fromWorkshopId") REFERENCES "Workshop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferOrder" ADD CONSTRAINT "TransferOrder_toWorkshopId_fkey" FOREIGN KEY ("toWorkshopId") REFERENCES "Workshop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferLine" ADD CONSTRAINT "TransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "TransferOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
