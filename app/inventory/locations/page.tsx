import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { BusinessUnitSwitcher } from "@/components/business-unit-switcher";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { LocationManager } from "./location-manager";

export default async function StockLocationsPage() {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const canManage = (await getInventoryAccess("inventory.manage")).ok;

  return (
    <main className="min-h-screen p-5 md:p-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <Breadcrumbs items={[{ label: "Inventory", href: "/inventory" }, { label: "Stock Locations" }]} />
          <h1 className="mt-2 text-2xl font-bold">Stock Locations</h1>
          <p className="mt-1 text-sm text-gray-600">Manage warehouses, showrooms, and other stock holding locations for this business unit.</p>
        </div>
        <BusinessUnitSwitcher />
      </header>
      <LocationManager canManage={canManage} />
    </main>
  );
}
