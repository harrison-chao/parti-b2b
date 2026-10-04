-- CreateTable
CREATE TABLE "OrderCombo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderCombo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderCombo_signature_key" ON "OrderCombo"("signature");

-- CreateIndex
CREATE INDEX "OrderCombo_source_usageCount_idx" ON "OrderCombo"("source", "usageCount");

