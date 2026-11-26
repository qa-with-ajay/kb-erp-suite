import type { Metadata } from "next";
import { auth } from "@/auth";
import { AuthProvider } from "@/components/auth-provider";
import { AppShell, type AppNavItem } from "@/components/app-shell";
import { getBusinessUnitPermissionCodes, hasGroupPermission } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kumar Brothers & Associates | ERP",
  description: "Inventory and billing management across Kumar Brothers & Associates business units",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  let items: AppNavItem[] = [];
  let canViewLowStock = false;
  let userDisplayRole = session?.user?.role ?? "";

  if (session?.user?.id) {
    const [permissions, accountRoles] = await Promise.all([
      getBusinessUnitPermissionCodes(),
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          groupRoles: { where: { role: { isActive: true } }, include: { role: { select: { name: true } } } },
          businessUnitRoles: { where: { role: { isActive: true }, businessUnit: { isActive: true } }, include: { role: { select: { name: true } } }, orderBy: { businessUnit: { name: "asc" } } },
        },
      }),
    ]);
    userDisplayRole = accountRoles?.groupRoles[0]?.role.name ?? accountRoles?.businessUnitRoles[0]?.role.name ?? userDisplayRole;
    canViewLowStock = permissions.has("inventory.read") || permissions.has("reports.unit.read");

    if (permissions.has("group.dashboard.read")) {
      items.push({ label: "Group dashboard", href: "/group-dashboard" });
    }
    if (permissions.has("reports.unit.read") || permissions.has("inventory.read")) {
      items.push({ label: "Unit Dashboard", href: "/dashboard" });
    }
    if (permissions.has("inventory.read")) {
      items.push(
        { label: "Inventory", href: "/inventory" },
        { label: "Products", href: "/inventory/products" },
        { label: "Stock", href: "/inventory/stock" },
      );
    }
    if (permissions.has("billing.read")) items.push({ label: "Sales & billing", href: "/sales" });
    if (permissions.has("accounting.read")) items.push(
      { label: "Financial Dashboard", href: "/financial", section: "Financial Management" },
      { label: "Chart of Accounts", href: "/financial/accounts", section: "Financial Management" },
      { label: "Journal Vouchers", href: "/financial/journals", section: "Financial Management" },
      { label: "General Ledger", href: "/financial/reports/general-ledger", section: "Financial Management" },
      { label: "Trial Balance", href: "/financial/reports/trial-balance", section: "Financial Management" },
      { label: "Accounting Periods", href: "/financial/periods", section: "Financial Management" },
    );
    if (await hasGroupPermission(session.user.id, "accounting.read")) items.push({ label: "Group Financials", href: "/financial/group" });
    if (permissions.has("purchases.manage")) items.push({ label: "Purchases", href: "/purchases" });
    if (permissions.has("customers.manage")) items.push({ label: "Customers", href: "/customers" });
    if (permissions.has("suppliers.manage")) items.push({ label: "Suppliers", href: "/suppliers" });
    if (permissions.has("users.manage")) items.push({ label: "User management", href: "/admin/users", section: "Administration" });
    if (permissions.has("roles.manage")) items.push({ label: "Roles & permissions", href: "/admin/roles", section: "Administration" });
  }

  return (
    <html lang="en">
      <body>
        <AuthProvider session={session}>
          <AppShell
            items={items}
            userName={session?.user?.name ?? "Signed in user"}
            userRole={userDisplayRole}
            canViewLowStock={canViewLowStock}
            isAuthenticated={Boolean(session?.user?.id)}
          >
            {children}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
