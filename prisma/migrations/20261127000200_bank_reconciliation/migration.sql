CREATE TYPE "BankReconciliationStatus" AS ENUM ('DRAFT', 'RECONCILED');

CREATE TABLE "BankReconciliation" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "paymentAccountId" UUID NOT NULL,
  "statementDate" DATE NOT NULL,
  "openingBalance" DECIMAL(14,2) NOT NULL,
  "statementBalance" DECIMAL(14,2) NOT NULL,
  "bookBalance" DECIMAL(14,2) NOT NULL,
  "difference" DECIMAL(14,2) NOT NULL,
  "status" "BankReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reconciledAt" TIMESTAMP(3),
  CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankReconciliation_businessUnitId_id_key" ON "BankReconciliation"("businessUnitId", "id");
CREATE INDEX "BankReconciliation_businessUnitId_paymentAccountId_statementDate_idx" ON "BankReconciliation"("businessUnitId", "paymentAccountId", "statementDate");
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_businessUnitId_paymentAccountId_fkey"
  FOREIGN KEY ("businessUnitId", "paymentAccountId") REFERENCES "PaymentAccount"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BankReconciliationItem" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "reconciliationId" UUID NOT NULL,
  "transactionId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankReconciliationItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankReconciliationItem_businessUnitId_id_key" ON "BankReconciliationItem"("businessUnitId", "id");
CREATE UNIQUE INDEX "BankReconciliationItem_businessUnitId_transactionId_key" ON "BankReconciliationItem"("businessUnitId", "transactionId");
CREATE INDEX "BankReconciliationItem_businessUnitId_reconciliationId_idx" ON "BankReconciliationItem"("businessUnitId", "reconciliationId");
ALTER TABLE "BankReconciliationItem" ADD CONSTRAINT "BankReconciliationItem_businessUnitId_reconciliationId_fkey"
  FOREIGN KEY ("businessUnitId", "reconciliationId") REFERENCES "BankReconciliation"("businessUnitId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationItem" ADD CONSTRAINT "BankReconciliationItem_businessUnitId_transactionId_fkey"
  FOREIGN KEY ("businessUnitId", "transactionId") REFERENCES "CashBankTransaction"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "description", "createdAt")
VALUES
  (gen_random_uuid(), 'cashbank.reconcile', 'Reconcile bank statements against posted cash and bank transactions.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" IN ('GROUP_ADMIN', 'ACCOUNTANT')
  AND permission."code" = 'cashbank.reconcile'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
