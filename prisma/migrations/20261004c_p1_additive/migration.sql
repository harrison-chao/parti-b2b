-- P1 批：交期承诺 override 原因 + 先款后产开关 + 工单 CANCELLED 态
ALTER TABLE "WorkOrder" ADD COLUMN "committedOverrideReason" TEXT;
ALTER TABLE "Dealer" ADD COLUMN "enforcePrepay" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
