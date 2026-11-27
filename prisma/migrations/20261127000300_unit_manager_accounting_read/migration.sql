-- Unit Managers need read-only access to the financial dashboard and reports
-- for the business units to which they are assigned. This does not grant
-- group-wide financial access or any accounting write/post permissions.

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'UNIT_MANAGER'
  AND role."scope" = 'BUSINESS_UNIT'
  AND permission."code" = 'accounting.read'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
