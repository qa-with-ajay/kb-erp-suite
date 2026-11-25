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
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold">Sales & billing</h1>
          <p className="mt-1 text-sm text-gray-600">Full-unit invoices for {access.context.businessUnit.name}. Panel cutting is not supported.</p>
        </div>
        <BusinessUnitSwitcher />
      </header>
      <SalesManager canManage={canManage} canSelectCustomer={canSelectCustomer} />
    </main>
  );
}
