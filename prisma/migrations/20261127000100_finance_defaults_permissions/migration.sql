-- Add a separate UPI clearing ledger so each payment account maps to one ledger account.
INSERT INTO "Account" (
  "id", "businessUnitId", "code", "name", "type", "description",
  "isSystem", "isControlAccount", "isActive", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), unit."id", '1020', 'UPI Clearing', 'ASSET',
  'Balance held in UPI wallets and payment settlement accounts.', true, false, true,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "BusinessUnit" unit
WHERE unit."isActive" = true
ON CONFLICT ("businessUnitId", "code") DO NOTHING;

INSERT INTO "PaymentAccount" (
  "id", "businessUnitId", "name", "type", "ledgerAccountId", "isActive", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), account."businessUnitId", 'Cash in Hand', 'CASH', account."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Account" account
WHERE account."code" = '1000' AND account."isSystem" = true
ON CONFLICT ("businessUnitId", "ledgerAccountId") DO NOTHING;

INSERT INTO "PaymentAccount" (
  "id", "businessUnitId", "name", "type", "ledgerAccountId", "isActive", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), account."businessUnitId", 'Bank Account', 'BANK', account."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Account" account
WHERE account."code" = '1010' AND account."isSystem" = true
ON CONFLICT ("businessUnitId", "ledgerAccountId") DO NOTHING;

INSERT INTO "PaymentAccount" (
  "id", "businessUnitId", "name", "type", "ledgerAccountId", "isActive", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), account."businessUnitId", 'UPI', 'UPI', account."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Account" account
WHERE account."code" = '1020' AND account."isSystem" = true
ON CONFLICT ("businessUnitId", "ledgerAccountId") DO NOTHING;

INSERT INTO "ExpenseCategory" (
  "id", "businessUnitId", "name", "expenseAccountId", "isActive", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), account."businessUnitId", category."name", expense_account."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Account" account
CROSS JOIN (VALUES
  ('Rent', '6000'),
  ('Utilities', '6000'),
  ('Salaries', '6000'),
  ('Office Supplies', '6000'),
  ('Travel & Conveyance', '6000'),
  ('Repairs & Maintenance', '6000'),
  ('Bank Charges', '6100'),
  ('Other Operating Expenses', '6000')
) AS category("name", "accountCode")
JOIN "Account" expense_account
  ON expense_account."businessUnitId" = account."businessUnitId"
 AND expense_account."code" = category."accountCode"
WHERE account."code" = '1000' AND account."isSystem" = true
ON CONFLICT ("businessUnitId", "name") DO NOTHING;

INSERT INTO "Permission" ("id", "code", "description", "createdAt")
VALUES
  (gen_random_uuid(), 'cashbank.read', 'View cash and bank accounts, transactions, books and reconciliation.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'cashbank.manage', 'Manage cash and bank accounts and transactions.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'expenses.read', 'View expense categories and expense records.', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'expenses.manage', 'Manage expense categories and record expenses.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" IN ('GROUP_ADMIN', 'ACCOUNTANT')
  AND permission."code" IN ('cashbank.read', 'cashbank.manage', 'expenses.read', 'expenses.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'UNIT_MANAGER'
  AND permission."code" IN ('cashbank.read', 'expenses.read')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
