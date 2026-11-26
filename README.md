# KB ERP Suite

A multi-user, multi-business-unit ERP foundation for Kumar Brothers & Associates. The application currently covers inventory, stock control, sales billing, purchasing, customer and supplier records, payments, returns, dashboards, and role-based administration.

> **Project status:** Active development. The modules below are present in the source tree. This is a source-based feature inventory, not a certification that every workflow has passed production acceptance testing. Complete the release-readiness checks before using the system as the sole record for live business transactions.

## Contents

- [Application modules](#application-modules)
- [Business units and access model](#business-units-and-access-model)
- [Technology stack](#technology-stack)
- [Routes](#routes)
- [Local development setup](#local-development-setup)
- [Environment variables](#environment-variables)
- [Database, migrations, demo data, and backups](#database-migrations-demo-data-and-backups)
- [Development commands](#development-commands)
- [Architecture overview](#architecture-overview)
- [Current limitations](#current-limitations)
- [Recommended improvement scope](#recommended-improvement-scope)
- [Release-readiness checklist](#release-readiness-checklist)

## Application modules

### 1. Organization, users, and permissions

- Five configured business units: KB Interiors, KB Electricals, KB Kitchen & Bath, KB Tools, and KB Tech.
- Group-level and business-unit-level role assignments.
- Built-in roles include Group Admin, Unit Manager, Accountant, Inventory Manager, and Cashier.
- Custom roles can be created with selected permissions; built-in system roles are protected.
- Group Admin has organization-wide access. Unit Manager assignments are constrained to one business unit; other unit roles can be assigned to multiple units where configured.
- User administration includes account creation, role/unit assignment, activation, and deactivation.
- Role administration includes custom role creation and permission configuration.
- Server-side permission checks protect pages and API operations; navigation visibility is not the security boundary.
- User and role administration changes are audit logged. Account activation is rechecked during session refresh, and the last active administrator is protected from deactivation/removal.

### 2. Inventory catalogue

- Product create, view, edit, activate/deactivate, and searchable/paginated listing.
- Category and brand management.
- Standard and material product types.
- Optional product variants with attributes and codes.
- Product-specific unit conversions, configured purchase/sales units, conversion precision, and rounding modes.
- Product pricing, GST rate, minimum-stock threshold, description, image URL, SKU, and barcode fields.
- Barcode types distinguish KB-generated internal Code 128 identifiers from manufacturer-provided barcodes. Internal codes are not represented as GS1/GTIN identifiers.
- Product details include stock balances and barcode label printing.

### 3. Barcode and product scanning

- Shared scanner supports keyboard-wedge USB scanners and browser camera scanning through ZXing.
- Product lookup accepts barcode, SKU, or supported scan input.
- Sales product entry supports inline product search within each invoice row.
- Manual invoice entry adds a new row only when the user chooses **Add product**.
- Scanning a new product can add it to the invoice automatically; repeated scans of the same product/variant increase its quantity rather than creating duplicate lines.
- The product scanner page displays product details and stock by location.

Camera access requires a supported browser and a secure context (normally HTTPS, or localhost during development).

### 4. Stock and warehouse operations

- Multiple stock locations per business unit.
- Opening stock, inward, outward, adjustment, and location-transfer movements.
- Stock balances and immutable stock-ledger entries.
- Weighted-average stock costing.
- Negative-stock prevention and opening-stock safeguards.
- Product/variant/location-aware stock records.
- Searchable and paginated stock balances and movement history.
- Low-stock indicators and in-app low-stock notification support.
- Idempotency safeguards on stock movement requests to reduce duplicate posting on retries.

### 5. Material processing and remnants

- Material products can have a configured material unit and conversion to the base unit.
- Material processing can consume standard stock or an existing remnant.
- Processing records input, consumed quantity, and one or more output remnants.
- Remnants retain product, variant, quantity, measurement information, location, and movement history.
- Remnant workflows include availability/status changes, transfer, sale, consumption, and waste tracking.
- Sales can allocate stock from standard balances and eligible remnants, subject to unit and allocation validation.

The material/remnant model and screens are implemented; complete operational acceptance testing with real cutting/measurement scenarios is still required.

### 6. Sales and billing

- Business-unit-scoped GST and non-GST sales invoices.
- Product/variant selection, inline search, barcode-assisted entry, supported sales units, and stock-source allocation.
- Customer lookup by mobile number or customer name from one combined search field, including partial matches.
- Existing customers can be selected; new customer details can be captured during checkout and saved to Customer Master only when the sale succeeds.
- Walk-in sales are supported for fully paid transactions. Credit sales require an identified customer.
- Sale creation, invoice numbering, stock deduction, cost snapshots, and audit history are handled in a database transaction.
- Optional initial payment can be captured as part of checkout.
- Invoice history with search and pagination.
- Invoice details include payment and return balances.
- Idempotency and stock revalidation protect sale submission against duplicate retries and concurrent stock changes.

### 7. Purchases and goods receiving

- Supplier-linked purchase orders with GST/non-GST tax mode.
- Product, variant, purchase-unit, conversion, precision, and rounding snapshots on order lines.
- Partial goods receipts against purchase orders.
- Receipt quantities are captured in purchase units; stock is updated using the configured conversion and rounding behaviour.
- Supplier invoice duplicate protection.
- Purchase order and receipt history, status, and outstanding quantities.
- Receipt posting, stock inward, costing, and audit history are transaction-backed and idempotent.

### 8. Payments, balances, and returns

- Customer collections against sales invoices and supplier payments against purchase receipts.
- Partial payments, payment methods, references, payment history, and outstanding balance calculations.
- Overpayment prevention and idempotent payment recording.
- Audited payment reversals.
- Sales returns and purchase returns with return quantity limits and stock/account effects.
- Sales return disposition supports restock or damaged stock handling.
- Purchase returns validate available stock.
- Audited return reversals use compensating transactions and stock checks.
- Invoice and receipt balances, receivables, payables, and customer/supplier account credits are adjusted for active payments and returns.

**Important:** Returns currently create account credit. They do not automatically issue cash refunds.

### 9. Dashboards and business records

- Unit dashboard: catalogue counts, standard-stock valuation, movement counts, low-stock alerts, all-time net sales, sales gross profit, receivables, payables, and customer/supplier credits.
- Group dashboard: consolidated unit-level overview across active business units.
- Group financial totals are grouped by currency rather than adding unlike currencies together.
- Customer and supplier masters support search, status filtering, pagination, create/edit, and activate/deactivate.
- Customer and supplier records are scoped to their business unit.

Gross profit is before expenses and overhead; it is not net profit.

### 10. Invoice printing and account settings

- Invoice print layouts include A4, 80 mm thermal, and 58 mm thermal formats.
- Browser print flow supports printing or saving the rendered invoice as PDF.
- The selected print format is remembered in browser local storage.
- User profile and password settings.
- Password recovery by email using SMTP. Reset links expire, reset tokens are stored as hashes, and successful password changes invalidate existing sessions.

## Business units and access model

| Business unit | Code |
|---|---|
| KB Interiors | KB_INTERIORS |
| KB Electricals | KB_ELECTRICALS |
| KB Kitchen & Bath | KB_KITCHEN_BATH |
| KB Tools | KB_TOOLS |
| KB Tech | KB_TECH |

Business-unit-owned catalogue, party, stock, purchasing, sales, payment, and return records are scoped by business unit. The Prisma schema also uses composite database relationships for key unit-owned references to reduce the risk of cross-unit associations.

The active business unit is selected in the application workspace. A user's effective access is determined by active role assignments and permissions for the selected role and business unit.

## Technology stack

| Area | Technology |
|---|---|
| Web application | Next.js 15 App Router, React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS 4 |
| Authentication | Auth.js / NextAuth credentials provider |
| Validation | Zod |
| Database | PostgreSQL 17 |
| ORM and migrations | Prisma 6 |
| Password hashing | bcryptjs |
| Barcode scanning | ZXing browser/library |
| Barcode labels | JsBarcode |
| Email | Nodemailer with SMTP |
| Local services | Docker Compose |
| UI source regression checks | Node.js built-in test runner |

## Routes

| Route | Purpose |
|---|---|
| /login | Sign in |
| /forgot-password and /reset-password | Password recovery |
| /dashboard | Business-unit dashboard |
| /group-dashboard | Group dashboard |
| /inventory | Inventory workspace |
| /inventory/products | Product catalogue |
| /inventory/categories and /inventory/brands | Catalogue classification |
| /inventory/stock | Stock balances and movement history |
| /inventory/locations | Stock locations |
| /inventory/remnants | Material remnants |
| /inventory/scanner | Barcode/SKU product lookup |
| /inventory/import | CSV product and optional inward-stock import |
| /sales and /sales/[id] | Sales checkout and invoice detail |
| /purchases | Purchase orders and goods receipts |
| /customers and /suppliers | Party masters |
| /admin/users and /admin/roles | User and role administration |
| /settings | Profile and account settings |

Pages and APIs perform server-side authentication and permission checks. Users only see navigation entries for the permissions available to their active role.

## Local development setup

### Prerequisites

- Node.js 20.9 or later.
- npm.
- Docker Desktop with Docker Compose.
- Git.

### 1. Clone and configure

~~~powershell
git clone https://github.com/qa-with-ajay/kb-erp-suite.git
cd kb-erp-suite
Copy-Item .env.example .env
~~~

On macOS/Linux, use **cp .env.example .env** instead of **Copy-Item**.

Edit .env and set a strong PostgreSQL password, matching DATABASE_URL credentials, and a long random AUTH_SECRET. URL-encode reserved characters in the database URL password.

Generate an authentication secret:

~~~bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
~~~

### 2. Start PostgreSQL and the backup service

~~~bash
docker compose up -d
docker compose ps
~~~

The database is exposed on host port **5433** by default and listens on port **5432** inside the container. The Compose stack also starts the scheduled database-backup sidecar.

Keep POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, POSTGRES_PORT, and DATABASE_URL aligned. PostgreSQL initialization variables do not change credentials in an already initialized data volume.

### 3. Install, generate Prisma Client, and migrate

~~~bash
npm install
npx prisma generate
npx prisma migrate deploy
~~~

Use **npm run db:migrate** for creating migrations during local schema development. Use **npm run db:deploy** or **npx prisma migrate deploy** to apply committed migrations in a deployment environment.

### 4. Create the first administrator

Public registration is disabled. From a trusted terminal, create the initial administrator after migrations:

~~~bash
node scripts/create-admin.mjs admin@example.com "Your Admin Name" "Use-A-Long-Unique-Password"
~~~

The script requires a password of at least 12 characters. Do not put real credentials in source control, issue comments, or shared logs.

Sign in at http://localhost:3000/login. Use **User management** to create accounts and assign built-in or custom roles to business units. Use **Roles & permissions** to configure custom roles.

### 5. Start the application

~~~bash
npm run dev
~~~

Open http://localhost:3000.

For a production-mode local smoke test:

~~~bash
npm run build
npm start
~~~

Do not expose the development server or PostgreSQL port directly to the public internet.

## Environment variables

Copy .env.example to .env. The example file documents the supported variables.

| Variable | Purpose |
|---|---|
| POSTGRES_USER | PostgreSQL username |
| POSTGRES_PASSWORD | PostgreSQL password |
| POSTGRES_DB | PostgreSQL database name |
| POSTGRES_PORT | Host port mapped to PostgreSQL (default 5433) |
| DATABASE_URL | Prisma PostgreSQL connection string |
| AUTH_SECRET | Auth.js signing/encryption secret |
| AUTH_URL | Application base URL used in authentication emails |
| SMTP_HOST and SMTP_PORT | SMTP server connection |
| SMTP_USER and SMTP_PASSWORD | SMTP credentials |
| EMAIL_FROM | Sender identity for password reset emails |
| RCLONE_REMOTE | Optional configured rclone destination for off-site backups |

### Gmail SMTP for password recovery

1. Use the Gmail account that should send KB-ERP emails.
2. Enable 2-Step Verification.
3. Create a Google App Password at https://myaccount.google.com/apppasswords.
4. Set the following values in .env:

~~~env
AUTH_URL="http://localhost:3000"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASSWORD="your-16-character-google-app-password"
EMAIL_FROM="KB-ERP <your-email@gmail.com>"
~~~

Remove spaces from the App Password. Keep all credentials private and never commit .env. Restart the app after changing environment variables. Password reset links expire after 15 minutes. Gmail sending limits may not be suitable for production volume; use a dedicated transactional email provider as usage grows.

## Database, migrations, demo data, and backups

### Demo data (development only)

After migrations and administrator creation:

~~~bash
npm run db:seed:demo
~~~

The seed creates clearly labeled sample products, parties, opening stock, purchase orders/receipts, and sales across the configured business units. It is designed to be safe to rerun, does not delete existing data, and refuses to run when NODE_ENV=production.

Do not use demo data as live inventory or financial records.

### Automated local database backups

The db-backup Compose service runs a PostgreSQL custom-format dump daily at **02:00 Asia/Kolkata**.

- Backup files are written to ./backups/daily.
- The backup is checked with pg_restore --list before it is retained.
- A SHA-256 checksum file is created alongside each dump.
- Local backups older than 30 days are removed.
- The backup script contains an optional rclone upload hook. Configure and securely provide the rclone remote credentials/configuration to the container before relying on off-site backups; setting RCLONE_REMOTE alone is not proof that cloud backup is working.

Monitor ./backups/daily/backup.log and periodically perform a restore drill into a separate test database. A successful dump is not a substitute for a tested restore procedure.

### Manual backup example

~~~bash
docker exec kb-db pg_dump -U kb_user -d kb_erp -F c -f /tmp/kb_erp_manual.dump
docker cp kb-db:/tmp/kb_erp_manual.dump ./kb_erp_manual.dump
~~~

Use the actual database username and database name from your .env file if they differ from the example.

### Prisma Studio

~~~bash
npm run db:studio
~~~

Use Prisma Studio carefully; direct edits can bypass application validation and audit workflows.

## Development commands

| Command | Description |
|---|---|
| npm run dev | Start Next.js development server on 0.0.0.0:3000 |
| npm run build | Generate Prisma Client and create a Next.js production build |
| npm start | Start the production server |
| npm run lint | Run the configured Next.js lint command |
| npm run test:ui | Run current Node-based sales UI source-regression tests |
| npm run db:generate | Generate Prisma Client |
| npm run db:migrate | Create/apply a development migration |
| npm run db:deploy | Apply committed migrations |
| npm run db:seed:demo | Add development demo records |
| npm run db:studio | Open Prisma Studio |

The current test:ui suite checks source-level UI contracts; it is not a browser-driven end-to-end test suite.

## Architecture overview

- app/: Next.js pages and route handlers.
- app/api/: HTTP endpoints. Routes call authentication/permission helpers, validate request input, and delegate business operations.
- components/: Shared workspace, forms, barcode scanner, payment/return panels, and invoice layouts.
- lib/*-validation.ts: Zod schemas and list-query parsing.
- lib/*-service.ts: Transaction-aware business logic for sales, stock, purchasing, payments, and returns.
- lib/inventory-auth.ts: Active business-unit selection and effective permission resolution.
- prisma/schema.prisma and prisma/migrations/: Relational data model and versioned schema changes.
- scripts/: Administrator creation and development seed scripts.
- docker/backup/: Scheduled PostgreSQL backup container.
- tests/ui/: Current source-level UI regression checks.

Important business operations use Prisma transactions, business-unit scoping, database constraints, and idempotency keys where implemented. Financial and inventory changes should be performed through application workflows rather than direct database edits.

## Current limitations

The following are not complete or should not be treated as production-ready capabilities:

- The accounting foundation now includes business-unit-scoped chart of accounts, financial periods, journal headers/lines, debit-credit constraints, and a separate ledger-backed Financial Management dashboard.
- Journal voucher entry/posting, automatic posting from sales/purchases/payments/returns, expense management, cash/bank books, bank reconciliation, trial balance, full P&L/Balance Sheet, and party statement ledgers are not yet implemented. Until posting workflows are delivered, the new dashboard correctly shows an empty-ledger state rather than deriving accounting balances from operational totals.
- Returns create account credit; a controlled cash/bank refund and credit-note settlement workflow is not implemented.
- GST rate calculation and GST/non-GST invoice modes exist, but full GST compliance is not implemented. HSN/SAC validation, place-of-supply tax determination, statutory return reports, e-invoicing, and e-way bill integration need separate work.
- A4 and 58/80 mm print layouts exist and use the browser print dialog; a server-generated PDF/document archive and configurable invoice templates are not provided.
- Inventory import is CSV-based; Excel workbook import/export and richer data-mapping tools are not included.
- Standard stock allocation uses whole base-stock units. Supported sale-unit conversions can use configured precision; material/remnant workflows need broader real-world end-to-end validation.
- No batch/lot, serial-number, expiry-date, or warranty tracking.
- No automated reorder suggestions or purchase planning based on lead time and consumption.
- The automated test suite is currently narrow and source-based. Comprehensive service/API integration tests and browser E2E coverage are not present.
- A production CI pipeline and deployment workflow are not included in the repository's current tracked source.
- Cloud backup upload requires additional rclone remote configuration and must be verified; local backup success alone does not establish disaster recovery readiness.

## Recommended improvement scope

This is a proposed roadmap, not a list of already implemented features.

### Priority 0 — Release stability and correctness

1. Consolidate duplicate CUSTOMER_DUPLICATE and CUSTOMER_PHONE_REQUIRED entries in app/api/sales/route.ts. Duplicate object keys can fail TypeScript compilation and should be resolved before the next release.
2. Run and fix npm run build, npm run lint, and npm run test:ui on the current branch; make these required checks in GitHub Actions.
3. Add database-backed integration tests for sales, stock movements, purchase orders/receipts, payments, returns, reversals, and idempotent retries.
4. Add Playwright browser tests for login/role access, business-unit switching, barcode sales, customer lookup/create, purchase receiving, invoice printing, and mobile layouts.
5. Add explicit cross-business-unit authorization tests for every sensitive API family, including negative tests for unauthorized reads and writes.
6. Add migration validation and a repeatable backup/restore test to the release pipeline.

### Priority 1 — Finance, tax, and operational reporting

1. Complete Chart of Accounts and journal voucher workflows, including balanced posting, reversal, period controls, and audit history.
2. Connect sales, purchases, payments, returns, and inventory valuation to automatic, idempotent journal posting; then deliver cash/bank books, trial balance, P&L, Balance Sheet, and bank reconciliation.
3. Add expense management, approvals, and supporting-document attachments.
3. Add customer/supplier statements, ageing reports, credit settlement, refund approval, and refund audit trails.
4. Add date-filtered sales/purchase reports, gross-margin analysis, stock valuation history, movement analysis, and monthly trends.
5. Extend tax handling with HSN/SAC, place-of-supply rules, CGST/SGST/IGST, tax summaries, GST reconciliation, and (where required) e-invoice/e-way bill integrations.
6. Make invoice numbering, business identity, terms, notes, and print templates configurable per business unit.

### Priority 2 — Inventory depth and workflow efficiency

1. Add batch/lot, serial-number, expiry, and warranty tracking where product categories require them.
2. Add cycle counts/physical stock audits with variance approval and ledger posting.
3. Add reorder levels, supplier lead times, suggested purchase orders, and stock reservation/commitment.
4. Add product/customer/supplier import-export with Excel support, duplicate resolution, and downloadable error reports.
5. Add controlled master-data merge tools for duplicate customers, suppliers, products, and barcodes.
6. Expand material processing and remnant tests for measurement precision, partial consumption, multi-output processing, transfers, damaged remnants, and concurrent sales.

### Priority 3 — Production operations, security, and usability

1. Add structured application logging, error monitoring, audit-log search/export, and operational alerts.
2. Review login/password-reset rate limits, session lifetime, secure cookie settings, security headers, secret rotation, and production database connection pooling.
3. Configure and verify off-site backups, retention policy, restore drills, and documented recovery objectives.
4. Add accessible keyboard workflows, clearer empty/error/loading states, responsive checks, and performance budgets for large catalogues and transaction histories.
5. Add deployment automation for staging/production, environment validation, health/readiness checks, and rollback procedures.

## Release-readiness checklist

Before using the system for live business transactions:

- [ ] Confirm the target branch and review all pending changes.
- [ ] Run npm ci, npx prisma generate, and npx prisma migrate deploy against a test database.
- [ ] Run npm run lint, npm run test:ui, and npm run build; resolve all failures.
- [ ] Execute sales, stock, purchasing, payment, return, and reversal scenarios using test data.
- [ ] Verify permissions and business-unit isolation with each role type.
- [ ] Verify barcode scanning on the actual shop hardware and browsers.
- [ ] Print and inspect A4, 80 mm, and 58 mm invoices on the intended printers.
- [ ] Configure SMTP and test password recovery end to end.
- [ ] Verify daily backups, checksum files, off-site copy if configured, and a full restore drill.
- [ ] Configure HTTPS, production secrets, monitoring, and a documented incident/recovery process.
