CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

CREATE TABLE "AccountingPeriod" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingPeriod_date_range_check" CHECK ("endDate" >= "startDate")
);
CREATE UNIQUE INDEX "AccountingPeriod_businessUnitId_id_key" ON "AccountingPeriod"("businessUnitId", "id");
CREATE UNIQUE INDEX "AccountingPeriod_businessUnitId_name_key" ON "AccountingPeriod"("businessUnitId", "name");
CREATE INDEX "AccountingPeriod_businessUnitId_status_startDate_endDate_idx" ON "AccountingPeriod"("businessUnitId", "status", "startDate", "endDate");
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Account" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AccountType" NOT NULL,
  "description" TEXT,
  "parentAccountId" UUID,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isControlAccount" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Account_businessUnitId_id_key" ON "Account"("businessUnitId", "id");
CREATE UNIQUE INDEX "Account_businessUnitId_code_key" ON "Account"("businessUnitId", "code");
CREATE INDEX "Account_businessUnitId_type_isActive_idx" ON "Account"("businessUnitId", "type", "isActive");
CREATE INDEX "Account_businessUnitId_parentAccountId_idx" ON "Account"("businessUnitId", "parentAccountId");
ALTER TABLE "Account" ADD CONSTRAINT "Account_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_businessUnitId_parentAccountId_fkey"
  FOREIGN KEY ("businessUnitId", "parentAccountId") REFERENCES "Account"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "JournalEntry" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "periodId" UUID NOT NULL,
  "voucherNumber" TEXT NOT NULL,
  "entryDate" DATE NOT NULL,
  "narration" TEXT NOT NULL,
  "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceType" TEXT,
  "sourceId" TEXT,
  "idempotencyKey" TEXT,
  "createdBy" TEXT NOT NULL,
  "postedBy" TEXT,
  "postedAt" TIMESTAMP(3),
  "reversedByEntryId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalEntry_source_pair_check" CHECK (("sourceType" IS NULL AND "sourceId" IS NULL) OR ("sourceType" IS NOT NULL AND "sourceId" IS NOT NULL))
);
CREATE UNIQUE INDEX "JournalEntry_businessUnitId_id_key" ON "JournalEntry"("businessUnitId", "id");
CREATE UNIQUE INDEX "JournalEntry_businessUnitId_voucherNumber_key" ON "JournalEntry"("businessUnitId", "voucherNumber");
CREATE UNIQUE INDEX "JournalEntry_businessUnitId_idempotencyKey_key" ON "JournalEntry"("businessUnitId", "idempotencyKey");
CREATE UNIQUE INDEX "JournalEntry_businessUnitId_sourceType_sourceId_key" ON "JournalEntry"("businessUnitId", "sourceType", "sourceId");
CREATE INDEX "JournalEntry_businessUnitId_entryDate_status_idx" ON "JournalEntry"("businessUnitId", "entryDate", "status");
CREATE INDEX "JournalEntry_businessUnitId_periodId_status_idx" ON "JournalEntry"("businessUnitId", "periodId", "status");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_businessUnitId_periodId_fkey"
  FOREIGN KEY ("businessUnitId", "periodId") REFERENCES "AccountingPeriod"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_postedBy_fkey"
  FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "JournalLine" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "journalEntryId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "lineNumber" INTEGER NOT NULL,
  "description" TEXT,
  "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalLine_one_sided_amount_check" CHECK (
    ("debit" >= 0 AND "credit" >= 0) AND
    (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))
  )
);
CREATE UNIQUE INDEX "JournalLine_businessUnitId_id_key" ON "JournalLine"("businessUnitId", "id");
CREATE UNIQUE INDEX "JournalLine_businessUnitId_journalEntryId_lineNumber_key" ON "JournalLine"("businessUnitId", "journalEntryId", "lineNumber");
CREATE INDEX "JournalLine_businessUnitId_accountId_createdAt_idx" ON "JournalLine"("businessUnitId", "accountId", "createdAt");
CREATE INDEX "JournalLine_businessUnitId_journalEntryId_idx" ON "JournalLine"("businessUnitId", "journalEntryId");
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_businessUnitId_journalEntryId_fkey"
  FOREIGN KEY ("businessUnitId", "journalEntryId") REFERENCES "JournalEntry"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_businessUnitId_accountId_fkey"
  FOREIGN KEY ("businessUnitId", "accountId") REFERENCES "Account"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "description", "createdAt")
VALUES
  (gen_random_uuid(), 'accounting.read', 'View financial dashboards, ledgers and accounting reports.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'accounting.manage', 'Manage chart of accounts, periods and draft journal vouchers.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'accounting.post', 'Post and reverse accounting journal vouchers.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'accounting.close_period', 'Close and reopen accounting periods.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'GROUP_ADMIN'
  AND permission."code" IN ('accounting.read', 'accounting.manage', 'accounting.post', 'accounting.close_period')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
