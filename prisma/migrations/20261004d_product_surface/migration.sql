-- 型材默认表面处理/颜色（用户需求：MR2525 即名称即规格，简化目录参数）
ALTER TABLE "Product" ADD COLUMN "surfaceProcessCode" TEXT;
ALTER TABLE "Product" ADD COLUMN "surfaceColorCode" TEXT;
