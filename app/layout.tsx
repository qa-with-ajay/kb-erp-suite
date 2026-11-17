import type { Metadata } from "next";
import { auth } from "@/auth";
import { AppShell, type AppNavItem } from "@/components/app-shell";
import { getBusinessUnitPermissionCodes } from "@/lib/inventory-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kumar Brothers & Associates | ERP",
  description: "Inventory and billing management across Kumar Brothers & Associates business units",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  let items: AppNavItem[] = [];

  if (session?.user?.id) {
    const permissions = await getBusinessUnitPermissionCodes();

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
    if (permissions.has("purchases.manage")) items.push({ label: "Purchases", href: "/purchases" });
    if (permissions.has("customers.manage")) items.push({ label: "Customers", href: "/customers" });
    if (permissions.has("suppliers.manage")) items.push({ label: "Suppliers", href: "/suppliers" });
  }

  return (
    <html lang="en">
      <body>
        <AppShell
          items={items}
          userName={session?.user?.name ?? "Signed in user"}
          userRole={session?.user?.role ?? ""}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
