INSERT INTO "Permission" ("id", "code", "description", "createdAt")
VALUES (
  '10000000-0000-4000-8000-000000000015',
  'roles.manage',
  'Create and configure custom roles and their permissions.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" = 'GROUP_ADMIN'
  AND permission."code" = 'roles.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
