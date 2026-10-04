-- P0(A5): 列表筛选与详情 join 索引（评审：SalesOrderLine.orderNo / SalesOrder(dealerId,createdAt)/(orderStatus) / PurchaseOrderLine.poNo 均为顺序扫描）
CREATE INDEX "SalesOrder_dealerId_createdAt_idx" ON "SalesOrder"("dealerId", "createdAt");
CREATE INDEX "SalesOrder_orderStatus_idx" ON "SalesOrder"("orderStatus");
CREATE INDEX "SalesOrderLine_orderNo_idx" ON "SalesOrderLine"("orderNo");
CREATE INDEX "PurchaseOrderLine_poNo_idx" ON "PurchaseOrderLine"("poNo");
