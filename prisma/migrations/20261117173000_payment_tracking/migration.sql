CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "businessUnitId" UUID NOT NULL,
    "saleId" UUID,
    "purchaseReceiptId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_exactly_one_target_check" CHECK (
      ("saleId" IS NOT NULL AND "purchaseReceiptId" IS NULL)
      OR ("saleId" IS NULL AND "purchaseReceiptId" IS NOT NULL)
    ),
    CONSTRAINT "Payment_positive_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "Payment_reversal_fields_check" CHECK (
      ("reversedAt" IS NULL AND "reversedBy" IS NULL AND "reversalReason" IS NULL)
      OR ("reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL AND "reversalReason" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "Payment_businessUnitId_id_key" ON "Payment"("businessUnitId", "id");
CREATE UNIQUE INDEX "Payment_businessUnitId_idempotencyKey_key" ON "Payment"("businessUnitId", "idempotencyKey");
CREATE INDEX "Payment_businessUnitId_saleId_paidAt_idx" ON "Payment"("businessUnitId", "saleId", "paidAt");
CREATE INDEX "Payment_businessUnitId_purchaseReceiptId_paidAt_idx" ON "Payment"("businessUnitId", "purchaseReceiptId", "paidAt");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessUnitId_saleId_fkey"
  FOREIGN KEY ("businessUnitId", "saleId") REFERENCES "Sale"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessUnitId_purchaseReceiptId_fkey"
  FOREIGN KEY ("businessUnitId", "purchaseReceiptId") REFERENCES "PurchaseReceipt"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedBy_fkey"
  FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversedBy_fkey"
  FOREIGN KEY ("reversedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
