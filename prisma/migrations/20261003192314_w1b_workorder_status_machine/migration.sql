-- W1/D3: WorkOrderStatus 状态机收敛
-- SCHEDULED、PREPARING 合并为 PENDING_START；新增 OUTSOURCING
-- Postgres 枚举不能删值，走"新建类型→列迁移→换名"路径

CREATE TYPE "WorkOrderStatus_new" AS ENUM ('PENDING_START', 'PROCESSING', 'OUTSOURCING', 'QC', 'PACKING', 'READY_TO_SHIP', 'SHIPPED');

ALTER TABLE "WorkOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "WorkOrder" ALTER COLUMN "status" TYPE "WorkOrderStatus_new" USING (
  CASE "status"
    WHEN 'SCHEDULED' THEN 'PENDING_START'
    WHEN 'PREPARING' THEN 'PENDING_START'
    ELSE "status"::text
  END::"WorkOrderStatus_new"
);
ALTER TABLE "WorkOrder" ALTER COLUMN "status" SET DEFAULT 'PENDING_START';

ALTER TABLE "WorkOrderEvent" ALTER COLUMN "fromStatus" TYPE "WorkOrderStatus_new" USING (
  CASE "fromStatus"
    WHEN 'SCHEDULED' THEN 'PENDING_START'
    WHEN 'PREPARING' THEN 'PENDING_START'
    ELSE "fromStatus"::text
  END::"WorkOrderStatus_new"
);
ALTER TABLE "WorkOrderEvent" ALTER COLUMN "toStatus" TYPE "WorkOrderStatus_new" USING (
  CASE "toStatus"
    WHEN 'SCHEDULED' THEN 'PENDING_START'
    WHEN 'PREPARING' THEN 'PENDING_START'
    ELSE "toStatus"::text
  END::"WorkOrderStatus_new"
);

DROP TYPE "WorkOrderStatus";
ALTER TYPE "WorkOrderStatus_new" RENAME TO "WorkOrderStatus";
