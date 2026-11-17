# Kumar Brothers & Associates ERP

Local-first foundation for a multi-user, multi-business-unit inventory and billing application.

## Stack
- Next.js App Router + React
- TypeScript for safer application code
- Tailwind CSS
- PostgreSQL in Docker
- Prisma ORM
- Auth.js credentials authentication

## Prerequisites
Install Node.js 20.9+ and Docker Desktop. Start Docker Desktop before starting the database.

## Setup (Windows PowerShell)
1. Copy `.env.example` to `.env`.
2. Set a strong `POSTGRES_PASSWORD` and use the same password in `DATABASE_URL`. URL-encode reserved characters in the connection URL.
3. Generate a secret and place it in `.env` as `AUTH_SECRET`. One way: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
4. Start PostgreSQL: `docker compose up -d`
5. Install packages: `npm install`
6. Generate Prisma client: `npx prisma generate`
7. Apply migrations without resetting data: `npx prisma migrate deploy`
8. Start the app: `npm run dev`
9. Open `http://localhost:3000`.

The local database listens on port `5433`; the container itself listens on `5432`. Keep `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and the corresponding `DATABASE_URL` credentials aligned. PostgreSQL initialization variables do not change credentials in an already initialized volume.

## Important: create the first administrator
The login screen is intentionally closed to public registration. Create the first admin from a trusted terminal after migrations:

```bash
node scripts/create-admin.mjs admin@example.com "Your Admin Name" "Use-A-Long-Unique-Password"
```

Then sign in with those credentials. Do not share the admin password. The script maps `ADMIN` to Group Admin and maps `MANAGER` or `CASHIER` to the KB Interiors unit role. Add additional users through the admin user-management feature when it is implemented in a later phase; until then, additional accounts can be created using the same script with a role argument (`ADMIN`, `MANAGER`, or `CASHIER`).

## Optional demo data (development only)
After applying migrations and creating an administrator, run `npm run db:seed:demo` to add sample catalog items, customers, suppliers, opening stock, purchase orders/receipts, and sales across all five business units. The seed is safe to rerun, uses clearly labeled demo records, and refuses to run when `NODE_ENV=production`. It does not delete existing data.

## LAN access
Run the app on the shop computer with `npm run dev` (the dev script binds to `0.0.0.0`). Find the shop computer's LAN IPv4 address using `ipconfig`, then open `http://SHOP-PC-IP:3000` from another device on the same Wi-Fi. Allow Node.js through Windows Firewall only on the Private network. For daily business use, Phase 1 should be hardened and run with `npm run build && npm start`; do not expose port 3000 or PostgreSQL to the public internet.

## Database backup
Create a backup regularly:

```bash
docker exec kb-interiors-db pg_dump -U kb_user kb_interiors > kb-interiors-backup.sql
```

Restore only after stopping the app and verifying the target database:

```bash
type kb-interiors-backup.sql | docker exec -i kb-interiors-db psql -U kb_user -d kb_interiors
```

## Data model
- User with ADMIN / MANAGER / CASHIER role
- BusinessUnit records for KB Interiors, KB Electricals, KB Kitchen & Bath, KB Tools, and KB Tech
- BusinessProfile for each unit's identity, GSTIN, address and invoice sequence settings
- Group and unit roles with database-backed permissions; the existing ADMIN account is mapped to Group Admin
- AuditLog foundation
- Business-unit-scoped Customer and Supplier master records; customer links and snapshots on sales invoices
- Unit-scoped customer collections and supplier payments linked to invoices/receipts, with partial balances and audited reversals
- Unit-scoped sales and purchase returns with credit/debit notes, stock ledger effects, quantity caps, and audited reversals
- Measurement units include PCS, SQFT, BOX, RFT, ROLL, METER, KG, LITRE, BUNDLE and SET

## Phase 2 progress
- Added inventory catalog, product/variant, unit conversion, stock ledger, location, panel operation and remnant schema.
- Added category and brand listing, search, filtering, pagination, create/edit, and activate/deactivate APIs and screens.
- Added product CRUD, optional product variants, and product-specific unit conversion management.
- Added the multi-unit foundation and data-preserving migration, assigning existing inventory and audit records to KB Interiors.
- Added permission-checked business-unit switching and scoped existing category, brand, product, variant and unit APIs to the active unit.
- Added database composite foreign keys to prevent cross-unit product, category, brand, location, and stock references.
- Seeded Group Admin, Unit Manager, Accountant, Inventory Manager, and Cashier roles and the initial permission catalog.
- Added unit and group dashboards with active product/category/brand counts, standard-stock valuation, recorded movement counts, and low-stock alerts.
- Added permission-checked, ledger-backed opening stock, inward, outward, and adjustment workflows with idempotency, negative-stock prevention, and weighted-average costing.
- Added unit-scoped stock balance and ledger views with movement entry and pagination.
- Added unit-scoped customer and supplier masters with search, status filters, pagination, create/edit, and activate/deactivate controls.
- Linked customer records to full-unit sales invoices while preserving a trusted customer name/phone snapshot on each invoice.
- Added unit-scoped full-unit sales and GST/non-GST invoices. Sale creation, invoice numbering, stock deduction, immutable ledger entries, cost snapshots, and audit history are committed in one transaction.
- Added printable invoice details and unit/group all-time sales and sales gross-profit summaries; tax is calculated on top of the product selling price.
- Added unit-scoped purchase-order APIs and goods-receipt APIs with partial receiving, supplier invoice duplicate protection, idempotency, purchase-in stock ledger entries, weighted-average costing, and audit history in a single transaction.
- Added unit-scoped customer collections and supplier payments against sales invoices and received supplier invoices, including partial payments, outstanding balances, payment methods, idempotent recording, overpayment prevention, and audited reversals.
- Added sales and purchase returns with credit/debit notes, return quantity limits, selectable stock locations, restock-or-damaged sales dispositions, supplier stock checks, idempotent posting, and audited compensating reversals.
- Updated invoice/receipt balances and dashboard receivables, payables, sales, gross profit, and account credits to account for active returns.
- Added the unit-scoped purchase screen for creating/searching/filtering purchase orders, viewing order and receipt history, and recording partial goods receipts.
- Purchase orders snapshot the selected purchase unit, conversion factor, precision, and rounding mode. Receipts are always recorded in purchase units; stock balances and ledger entries update only when cumulative rounding produces a nonzero base-unit delta.
- Invoice quantities must be whole numbers in the product base unit. Panel products must use PCS; cutting, partial-panel sales, and remnants are intentionally not supported.
- Expenses, GST compliance validation, monthly financial trends, and broader profit-and-loss reporting are not implemented yet.

## Current limitations
The application does not yet provide user-management UI, detailed consolidated reports, bank reconciliation, cash-refund processing, account-level statements, GST compliance checks, backup automation, or dedicated A4/thermal invoice layouts. Returns create account credit and do not automatically issue cash refunds. Sales are whole-unit only; panel cutting and remnant workflows are intentionally excluded. Complete and test remaining features before live shop use.
