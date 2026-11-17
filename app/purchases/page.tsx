import { redirect } from "next/navigation";
import { BusinessUnitSwitcher } from "@/components/business-unit-switcher";
import { PurchaseManager } from "@/components/purchase-manager";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

export default async function PurchasesPage() {
  const access = await getBusinessUnitAccess("purchases.manage");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold">Purchases</h1>
          <p className="mt-1 text-sm text-gray-600">Purchase orders and goods receipts for {access.context.businessUnit.name}.</p>
        </div>
        <BusinessUnitSwitcher />
      </header>
      <PurchaseManager />
    </main>
  );
}
