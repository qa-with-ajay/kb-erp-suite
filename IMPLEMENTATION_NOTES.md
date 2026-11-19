# Central administration implementation

This update extends the existing group/unit RBAC foundation. It does not add a second authentication system or change the existing user/role relationship schema.

## Included

- `/admin/users`: create users, assign a built-in or custom role, assign a Unit Manager to exactly one business unit, assign other unit-scoped roles to one or more units, edit assignments, and activate/deactivate accounts.
- `/admin/roles`: create custom group-wide or business-unit roles and configure their permission sets. Built-in system roles are protected.
- `/api/admin/users` and `/api/admin/users/[id]`: user administration APIs.
- `/api/admin/roles` and `/api/admin/roles/[id]`: role administration APIs.
- Group-scope authorization helpers for the administration pages and APIs.
- A new migration adds `roles.manage` to the permission catalog and grants it to `GROUP_ADMIN`.
- Audit log entries for user and role changes.
- Last-active-administrator protection and session-time account activation checks.
- Administration navigation group and a direct settings shortcut in the top-right header. Existing notification and profile/logout dropdown controls are retained.

## Access model

- `GROUP_ADMIN` is organization-wide and receives all catalogued permissions, including `users.manage` and `roles.manage`.
- `UNIT_MANAGER` is business-unit scoped and must be assigned to exactly one active business unit.
- Other business-unit roles can be assigned to one or more active business units.
- Custom group roles can grant selected group-wide and/or unit-operation permissions across the group. Custom business-unit roles cannot receive group-only permissions.
- Server-side API checks enforce access; hiding navigation items is not treated as a security boundary.

## Apply locally

From the project directory, with Docker/PostgreSQL running and `.env` configured:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Then sign in as the existing Group Admin (or create the first one with `scripts/create-admin.mjs`) and open **Administration → User management** or **Administration → Roles & permissions**.

## Verification note

The source changes and migration are included. A full Next.js build was not run in this workspace because package installation did not complete; run the commands above in the project environment to generate Prisma Client and perform the authoritative type/build checks before using it with live business data.

## Product barcode implementation

- New products default to a KB-generated internal Code 128 barcode. The API generates it from a UUID on the server, so clients cannot choose or collide with the generated value.
- Products can instead use a manufacturer barcode scanned with the existing camera/USB scanner or entered manually. Manufacturer values are preserved as supplied.
- `Product.barcodeType` records `INTERNAL` versus `MANUFACTURER`; the migration classifies existing non-empty barcodes as manufacturer-provided and leaves products without a barcode as internal.
- Product details render the barcode and provide a print-label action. Internal identifiers are not represented as GS1/GTIN numbers.
- Barcode uniqueness continues to be enforced by the existing business-unit-scoped unique constraint.

Apply the new migration with `npx prisma migrate deploy`, then run `npx prisma generate` and `npm run build`.
