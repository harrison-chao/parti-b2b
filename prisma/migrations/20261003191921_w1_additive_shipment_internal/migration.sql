-- CreateEnum
CREATE TYPE "OrderVia" AS ENUM ('PORTAL', 'INTERNAL');

-- CreateEnum
CREATE TYPE "DealerCustomerType" AS ENUM ('DEALER', 'WALK_IN');

-- CreateEnum
CREATE TYPE "FreightPayType" AS ENUM ('PREPAID', 'COD', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ShipmentFromType" AS ENUM ('FACTORY', 'OUTSOURCER');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_SHIPPED';

-- AlterTable
ALTER TABLE "Dealer" ADD COLUMN     "customerType" "DealerCustomerType" NOT NULL DEFAULT 'DEALER',
ADD COLUMN     "internalOwnerUserId" TEXT,
ADD COLUMN     "nickname" TEXT;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "createdVia" "OrderVia" NOT NULL DEFAULT 'PORTAL',
ADD COLUMN     "displayOrderNo" TEXT,
ADD COLUMN     "legacyBaseNo" TEXT,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceNote" TEXT;

-- AlterTable
ALTER TABLE "SalesOrderLine" ADD COLUMN     "legacyRawSize" TEXT,
ADD COLUMN     "processCodes" TEXT[],
ADD COLUMN     "surfaceColorCode" TEXT,
ADD COLUMN     "surfaceProcessCode" TEXT;

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "shipmentNo" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "trackingNo" TEXT,
    "shippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freightPayType" "FreightPayType" NOT NULL DEFAULT 'PREPAID',
    "fromType" "ShipmentFromType" NOT NULL DEFAULT 'FACTORY',
    "fromNote" TEXT,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLine" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shipmentNo_key" ON "Shipment"("shipmentNo");

-- CreateIndex
CREATE INDEX "Shipment_shippedAt_idx" ON "Shipment"("shippedAt");

-- CreateIndex
CREATE INDEX "Shipment_carrier_trackingNo_idx" ON "Shipment"("carrier", "trackingNo");

-- CreateIndex
CREATE INDEX "ShipmentLine_shipmentId_idx" ON "ShipmentLine"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentLine_orderNo_idx" ON "ShipmentLine"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_legacyBaseNo_key" ON "SalesOrder"("legacyBaseNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_displayOrderNo_key" ON "SalesOrder"("displayOrderNo");

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_orderNo_fkey" FOREIGN KEY ("orderNo") REFERENCES "SalesOrder"("orderNo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "SalesOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

