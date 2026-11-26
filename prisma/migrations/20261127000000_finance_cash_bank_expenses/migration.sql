CREATE TYPE "PaymentAccountType" AS ENUM ('CASH', 'BANK', 'UPI');
CREATE TYPE "CashBankTransactionType" AS ENUM ('RECEIPT', 'PAYMENT', 'TRANSFER');

CREATE TABLE "PaymentAccount" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" "PaymentAccountType" NOT NULL,
  "ledgerAccountId" UUID NOT NULL,
  "bankName" TEXT,
  "accountNumberLast4" TEXT,
  "ifsc" TEXT,
  "upiId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentAccount_businessUnitId_id_key" ON "PaymentAccount"("businessUnitId", "id");
CREATE UNIQUE INDEX "PaymentAccount_businessUnitId_name_key" ON "PaymentAccount"("businessUnitId", "name");
CREATE UNIQUE INDEX "PaymentAccount_businessUnitId_ledgerAccountId_key" ON "PaymentAccount"("businessUnitId", "ledgerAccountId");
CREATE INDEX "PaymentAccount_businessUnitId_type_isActive_idx" ON "PaymentAccount"("businessUnitId", "type", "isActive");
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_businessUnitId_ledgerAccountId_fkey"
  FOREIGN KEY ("businessUnitId", "ledgerAccountId") REFERENCES "Account"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CashBankTransaction" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "transactionNumber" TEXT NOT NULL,
  "type" "CashBankTransactionType" NOT NULL,
  "paymentAccountId" UUID NOT NULL,
  "destinationAccountId" UUID,
  "offsetAccountId" UUID,
  "amount" DECIMAL(14,2) NOT NULL,
  "transactionDate" DATE NOT NULL,
  "reference" TEXT,
  "narration" TEXT NOT NULL,
  "journalEntryId" UUID NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashBankTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashBankTransaction_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "CashBankTransaction_shape_check" CHECK (
    ("type" = 'TRANSFER' AND "destinationAccountId" IS NOT NULL AND "offsetAccountId" IS NULL AND "destinationAccountId" <> "paymentAccountId")
    OR ("type" IN ('RECEIPT', 'PAYMENT') AND "destinationAccountId" IS NULL AND "offsetAccountId" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "CashBankTransaction_businessUnitId_id_key" ON "CashBankTransaction"("businessUnitId", "id");
CREATE UNIQUE INDEX "CashBankTransaction_businessUnitId_transactionNumber_key" ON "CashBankTransaction"("businessUnitId", "transactionNumber");
CREATE UNIQUE INDEX "CashBankTransaction_businessUnitId_journalEntryId_key" ON "CashBankTransaction"("businessUnitId", "journalEntryId");
CREATE INDEX "CashBankTransaction_businessUnitId_paymentAccountId_transactionDate_idx" ON "CashBankTransaction"("businessUnitId", "paymentAccountId", "transactionDate");
ALTER TABLE "CashBankTransaction" ADD CONSTRAINT "CashBankTransaction_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashBankTransaction" ADD CONSTRAINT "CashBankTransaction_businessUnitId_paymentAccountId_fkey"
  FOREIGN KEY ("businessUnitId", "paymentAccountId") REFERENCES "PaymentAccount"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashBankTransaction" ADD CONSTRAINT "CashBankTransaction_businessUnitId_destinationAccountId_fkey"
  FOREIGN KEY ("businessUnitId", "destinationAccountId") REFERENCES "PaymentAccount"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashBankTransaction" ADD CONSTRAINT "CashBankTransaction_businessUnitId_offsetAccountId_fkey"
  FOREIGN KEY ("businessUnitId", "offsetAccountId") REFERENCES "Account"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashBankTransaction" ADD CONSTRAINT "CashBankTransaction_businessUnitId_journalEntryId_fkey"
  FOREIGN KEY ("businessUnitId", "journalEntryId") REFERENCES "JournalEntry"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashBankTransaction" ADD CONSTRAINT "CashBankTransaction_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ExpenseCategory" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "expenseAccountId" UUID NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ExpenseCategory_businessUnitId_id_key" ON "ExpenseCategory"("businessUnitId", "id");
CREATE UNIQUE INDEX "ExpenseCategory_businessUnitId_name_key" ON "ExpenseCategory"("businessUnitId", "name");
CREATE INDEX "ExpenseCategory_businessUnitId_isActive_idx" ON "ExpenseCategory"("businessUnitId", "isActive");
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_businessUnitId_expenseAccountId_fkey"
  FOREIGN KEY ("businessUnitId", "expenseAccountId") REFERENCES "Account"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Expense" (
  "id" UUID NOT NULL,
  "businessUnitId" UUID NOT NULL,
  "expenseNumber" TEXT NOT NULL,
  "categoryId" UUID NOT NULL,
  "paymentAccountId" UUID NOT NULL,
  "expenseDate" DATE NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "journalEntryId" UUID NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Expense_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "Expense_businessUnitId_id_key" ON "Expense"("businessUnitId", "id");
CREATE UNIQUE INDEX "Expense_businessUnitId_expenseNumber_key" ON "Expense"("businessUnitId", "expenseNumber");
CREATE UNIQUE INDEX "Expense_businessUnitId_journalEntryId_key" ON "Expense"("businessUnitId", "journalEntryId");
CREATE INDEX "Expense_businessUnitId_expenseDate_categoryId_idx" ON "Expense"("businessUnitId", "expenseDate", "categoryId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessUnitId_categoryId_fkey"
  FOREIGN KEY ("businessUnitId", "categoryId") REFERENCES "ExpenseCategory"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessUnitId_paymentAccountId_fkey"
  FOREIGN KEY ("businessUnitId", "paymentAccountId") REFERENCES "PaymentAccount"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessUnitId_journalEntryId_fkey"
  FOREIGN KEY ("businessUnitId", "journalEntryId") REFERENCES "JournalEntry"("businessUnitId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
