-- 原料批次计价·第 0 步数据铺底（评审 RAW_MATERIAL_COSTING_DESIGN.md 第肆节）
-- 纯 additive：五列全部 nullable，读端不消费前零行为变化

-- Product：截面米重（成本换算基数）+ 原料阶段（RAW 定尺长管 / SEMI 半成品段）
ALTER TABLE "Product" ADD COLUMN "weightPerMeter" DECIMAL(7,4);
ALTER TABLE "Product" ADD COLUMN "materialStage" TEXT;

-- WorkshopInventory：移动加权平均每米成本（元/米，分车间）
ALTER TABLE "WorkshopInventory" ADD COLUMN "avgCostPerMeter" DECIMAL(10,4);

-- StockMovement：出入库时点每米成本快照（审计与加权回放）
ALTER TABLE "StockMovement" ADD COLUMN "unitCost" DECIMAL(12,4);

-- SalesOrderLine：下单冻结的成本构成 JSON
ALTER TABLE "SalesOrderLine" ADD COLUMN "costSnapshot" TEXT;

-- 回填：米重取全局定价设置 meterWeight（缺省 0.65）；既有原料标记为 RAW
UPDATE "Product" SET "weightPerMeter" = COALESCE(
  (SELECT ("value"->>'meterWeight')::DECIMAL(7,4) FROM "SystemSetting" WHERE "key" = 'pricing'),
  0.65
) WHERE "category" = 'PROFILE' AND "weightPerMeter" IS NULL;
UPDATE "Product" SET "materialStage" = 'RAW' WHERE "isRawMaterial" = true AND "materialStage" IS NULL;
