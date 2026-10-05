-- 库存分析查询模式索引：工单按状态扫（占用/需求）、流水按类型+时间聚合（补货/ABC）
CREATE INDEX "WorkOrder_status_idx" ON "WorkOrder"("status");
CREATE INDEX "StockMovement_type_createdAt_idx" ON "StockMovement"("type", "createdAt");
