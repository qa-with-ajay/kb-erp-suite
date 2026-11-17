import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [emailArg, nameArg, passwordArg, roleArg = "ADMIN"] = process.argv.slice(2);
if (!emailArg || !nameArg || !passwordArg) {
  console.error('Usage: node scripts/create-admin.mjs <email> <name> <password> [ADMIN|MANAGER|CASHIER]');
  process.exit(1);
}
const email = emailArg.trim().toLowerCase();
const role = roleArg.toUpperCase();
if (!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(email)) throw new Error("Enter a valid email address.");
if (passwordArg.length < 12) throw new Error("Use a password of at least 12 characters.");
if (!["ADMIN", "MANAGER", "CASHIER"].includes(role)) throw new Error("Role must be ADMIN, MANAGER or CASHIER.");
const prisma = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(passwordArg, 12);
  const user = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: { name: nameArg, passwordHash, role, isActive: true },
      create: { email, name: nameArg, passwordHash, role },
      select: { id: true, email: true, name: true, role: true },
    });
    if (role === "ADMIN") {
      const groupAdminRole = await tx.role.findUnique({ where: { code: "GROUP_ADMIN" }, select: { id: true } });
      if (!groupAdminRole) throw new Error("Run database migrations before creating users.");
      await tx.userGroupRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: groupAdminRole.id } },
        create: { userId: user.id, roleId: groupAdminRole.id },
        update: {},
      });
      return user;
    }

    const [businessUnit, unitRole, groupAdminRole, legacyUnitRoles] = await Promise.all([
      tx.businessUnit.findUnique({ where: { code: "KB_INTERIORS" }, select: { id: true } }),
      tx.role.findUnique({ where: { code: role === "MANAGER" ? "UNIT_MANAGER" : "CASHIER" }, select: { id: true } }),
      tx.role.findUnique({ where: { code: "GROUP_ADMIN" }, select: { id: true } }),
      tx.role.findMany({ where: { code: { in: ["UNIT_MANAGER", "CASHIER"] } }, select: { id: true } }),
    ]);
    if (!businessUnit || !unitRole || !groupAdminRole) {
      throw new Error("Run database migrations before creating users.");
    }

    await tx.userGroupRole.deleteMany({ where: { userId: user.id, roleId: groupAdminRole.id } });
    await tx.userBusinessUnitRole.deleteMany({
      where: { userId: user.id, businessUnitId: businessUnit.id, roleId: { in: legacyUnitRoles.map(({ id }) => id) } },
    });
    await tx.userBusinessUnitRole.create({
      data: { userId: user.id, businessUnitId: businessUnit.id, roleId: unitRole.id },
    });
    return user;
  });
  console.log("User created/updated:", user);
} finally {
  await prisma.$disconnect();
}
