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
CREATE UNIQUE INDEX "JournalEntry_businessUnitId_reversedByEntryId_key" ON "JournalEntry"("businessUnitId", "reversedByEntryId");
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_businessUnitId_reversedByEntryId_fkey"
  FOREIGN KEY ("businessUnitId", "reversedByEntryId") REFERENCES "JournalEntry"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

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


-- Posted journals are immutable; corrections must be represented by a reversal voucher.
CREATE OR REPLACE FUNCTION "enforce_journal_entry_immutability"()
RETURNS trigger
LANGUAGE plpgsql
AS $
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Posted or reversed journal entries cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" <> 'DRAFT' THEN
    IF OLD."status" = 'POSTED'
      AND NEW."status" = 'REVERSED'
      AND NEW."reversedByEntryId" IS NOT NULL
      AND (to_jsonb(NEW) - ARRAY['status', 'reversedByEntryId', 'updatedAt'])
          = (to_jsonb(OLD) - ARRAY['status', 'reversedByEntryId', 'updatedAt']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Posted or reversed journal entries are immutable; create a reversal instead.';
  END IF;
  RETURN NEW;
END;
$;

CREATE TRIGGER "JournalEntry_immutable_guard"
BEFORE UPDATE OR DELETE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION "enforce_journal_entry_immutability"();

CREATE OR REPLACE FUNCTION "enforce_journal_line_immutability"()
RETURNS trigger
LANGUAGE plpgsql
AS $
DECLARE
  entry_status "JournalEntryStatus";
  target_business_unit UUID;
  target_entry UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_business_unit := OLD."businessUnitId";
    target_entry := OLD."journalEntryId";
  ELSE
    target_business_unit := NEW."businessUnitId";
    target_entry := NEW."journalEntryId";
  END IF;

  SELECT "status" INTO entry_status
  FROM "JournalEntry"
  WHERE "businessUnitId" = target_business_unit AND "id" = target_entry;

  IF entry_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Journal lines can only be changed while their voucher is a draft.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$;

CREATE TRIGGER "JournalLine_immutable_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine"
FOR EACH ROW EXECUTE FUNCTION "enforce_journal_line_immutability"();

-- Deferred constraint checks ensure a voucher is balanced when the transaction commits.
CREATE OR REPLACE FUNCTION "enforce_posted_journal_balanced"()
RETURNS trigger
LANGUAGE plpgsql
AS $
DECLARE
  target_business_unit UUID;
  target_entry UUID;
  entry_status "JournalEntryStatus";
  debit_total NUMERIC(18,2);
  credit_total NUMERIC(18,2);
  line_count BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'JournalEntry' THEN
    target_business_unit := COALESCE(NEW."businessUnitId", OLD."businessUnitId");
    target_entry := COALESCE(NEW."id", OLD."id");
  ELSIF TG_OP = 'DELETE' THEN
    target_business_unit := OLD."businessUnitId";
    target_entry := OLD."journalEntryId";
  ELSE
    target_business_unit := NEW."businessUnitId";
    target_entry := NEW."journalEntryId";
  END IF;

  SELECT "status" INTO entry_status
  FROM "JournalEntry"
  WHERE "businessUnitId" = target_business_unit AND "id" = target_entry;

  IF entry_status IN ('POSTED', 'REVERSED') THEN
    SELECT COALESCE(SUM("debit"), 0), COALESCE(SUM("credit"), 0), COUNT(*)
      INTO debit_total, credit_total, line_count
    FROM "JournalLine"
    WHERE "businessUnitId" = target_business_unit AND "journalEntryId" = target_entry;
    IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'Posted journal voucher must contain at least two lines and balance debits to credits.';
    END IF;
  END IF;
  RETURN NULL;
END;
$;

CREATE CONSTRAINT TRIGGER "JournalEntry_balanced_guard"
AFTER INSERT OR UPDATE ON "JournalEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_posted_journal_balanced"();

CREATE CONSTRAINT TRIGGER "JournalLine_balanced_guard"
AFTER INSERT OR UPDATE OR DELETE ON "JournalLine"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_posted_journal_balanced"();

-- Bootstrap the current Indian financial year and a starter chart of accounts for each active unit.
INSERT INTO "AccountingPeriod" ("id", "businessUnitId", "name", "startDate", "endDate", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), unit."id", 'FY 2026-27', DATE '2026-04-01', DATE '2027-03-31', 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "BusinessUnit" unit
WHERE unit."isActive" = true
ON CONFLICT ("businessUnitId", "name") DO NOTHING;

INSERT INTO "Account" (
  "id", "businessUnitId", "code", "name", "type", "description",
  "isSystem", "isControlAccount", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), unit."id", seed."code", seed."name", seed."type"::"AccountType",
  seed."description", true, seed."isControlAccount", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "BusinessUnit" unit
CROSS JOIN (VALUES
  ('1000', 'Cash in Hand', 'ASSET', 'Cash held at the business unit.', false),
  ('1010', 'Bank Accounts', 'ASSET', 'Balances held in bank accounts.', false),
  ('1100', 'Accounts Receivable', 'ASSET', 'Customer balances due.', true),
  ('1200', 'Inventory', 'ASSET', 'Value of saleable inventory.', true),
  ('1300', 'Input GST', 'ASSET', 'Recoverable input GST, subject to eligibility.', true),
  ('2000', 'Accounts Payable', 'LIABILITY', 'Supplier balances due.', true),
  ('2100', 'Output GST', 'LIABILITY', 'GST collected and payable.', true),
  ('3000', 'Owner Capital', 'EQUITY', 'Owner contributions and capital.', false),
  ('3100', 'Retained Earnings', 'EQUITY', 'Accumulated retained earnings.', false),
  ('4000', 'Sales Revenue', 'INCOME', 'Revenue from sales.', false),
  ('4100', 'Sales Returns', 'INCOME', 'Contra-revenue from sales returns.', false),
  ('5000', 'Cost of Goods Sold', 'EXPENSE', 'Cost of inventory sold.', false),
  ('6000', 'Operating Expenses', 'EXPENSE', 'General operating expenses.', false),
  ('6100', 'Bank Charges', 'EXPENSE', 'Banking and payment processing charges.', false),
  ('6200', 'Inventory Adjustments', 'EXPENSE', 'Inventory write-offs and adjustments.', false)
) AS seed("code", "name", "type", "description", "isControlAccount")
WHERE unit."isActive" = true
ON CONFLICT ("businessUnitId", "code") DO NOTHING;
INSERT INTO "Account" (
  "id", "businessUnitId", "code", "name", "type", "description",
  "isSystem", "isControlAccount", "isActive", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), unit."id", '5100', 'Purchase Price Variance', 'EXPENSE',
  'Difference between supplier credit value and inventory cost relieved on purchase returns.',
  true, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "BusinessUnit" unit
WHERE unit."isActive" = true
ON CONFLICT ("businessUnitId", "code") DO NOTHING;

