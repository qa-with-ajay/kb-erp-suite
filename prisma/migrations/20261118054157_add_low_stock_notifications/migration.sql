-- CreateTable
CREATE TABLE "LowStockNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LowStockNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LowStockNotification_userId_businessUnitId_isRead_idx" ON "LowStockNotification"("userId", "businessUnitId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "LowStockNotification_userId_businessUnitId_productId_key" ON "LowStockNotification"("userId", "businessUnitId", "productId");

-- AddForeignKey
ALTER TABLE "LowStockNotification" ADD CONSTRAINT "LowStockNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LowStockNotification" ADD CONSTRAINT "LowStockNotification_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LowStockNotification" ADD CONSTRAINT "LowStockNotification_businessUnitId_productId_fkey" FOREIGN KEY ("businessUnitId", "productId") REFERENCES "Product"("businessUnitId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
