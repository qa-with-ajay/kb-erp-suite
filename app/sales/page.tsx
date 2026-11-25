import { redirect } from "next/navigation";
import { BusinessUnitSwitcher } from "@/components/business-unit-switcher";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { SalesManager } from "./sales-manager";

export default async function SalesPage() {
  const access = await getBusinessUnitAccess("billing.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const [canManage, canSelectCustomer] = await Promise.all([
    getBusinessUnitAccess("billing.manage").then((result) => result.ok),
    getBusinessUnitAccess("customers.manage").then((result) => result.ok),
  ]);

  return (
    <main data-testid="sales-page" className="min-h-screen bg-[var(--app-canvas)] px-4 py-6 sm:px-6 lg:px-8">
      <header className="mx-auto mb-6 flex max-w-[1600px] flex-wrap items-end justify-between gap-4 rounded-2xl border border-[var(--app-border)] bg-white px-5 py-5 shadow-sm sm:px-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--app-blue)]">Commerce · Transactions</p>\n          <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">Sales & billing</h1>
          <p className="mt-1 text-sm text-gray-500">Create invoices, manage payments and review sales for {access.context.businessUnit.name}. Panel cutting is not supported.</p>
        </div>
        <BusinessUnitSwitcher />
      </header>
      <div className="mx-auto max-w-[1600px]"><SalesManager canManage={canManage} canSelectCustomer={canSelectCustomer} /></div>
    </main>
  );
}
