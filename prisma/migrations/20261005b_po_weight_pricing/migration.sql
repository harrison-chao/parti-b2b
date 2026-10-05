-- 批次计价·第 2 步：采购按重量批次结算（评审 RAW_MATERIAL_COSTING_DESIGN.md 第肆节）
-- 纯 additive：四列全 nullable，存量行=BAR（按根）语义不变

ALTER TABLE "PurchaseOrderLine" ADD COLUMN "pricingUnit" TEXT;
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "totalWeightKg" DECIMAL(10,2);
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "receivedWeightKg" DECIMAL(10,2);
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "settleUnitPrice" DECIMAL(10,4);

UPDATE "PurchaseOrderLine" SET "pricingUnit" = 'BAR' WHERE "pricingUnit" IS NULL;
