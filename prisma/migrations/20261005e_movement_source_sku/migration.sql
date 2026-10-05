-- 余段回库流水带来源原料 SKU：上限反查从解析 note 文本改为结构化列
ALTER TABLE "StockMovement" ADD COLUMN "sourceSku" TEXT;
