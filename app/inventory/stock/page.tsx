import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { StockManager } from "./stock-manager";

export default async function StockPage() {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const canManage = (await getInventoryAccess("inventory.manage")).ok;

  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="mb-6">
        <Breadcrumbs items={[{ label: "Inventory", href: "/inventory" }, { label: "Stock management" }]} />
        <h1 className="text-2xl font-bold">Stock management</h1>
        <p className="mt-1 text-sm text-gray-600">Opening stock, inward, outward and adjustments for the active business unit.</p>
      </header>
      <StockManager canManage={canManage} />
    </main>
  );
}
