import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { RemnantManager } from "./remnant-manager";

export default async function RemnantsPage() {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const canManage = (await getInventoryAccess("inventory.manage")).ok;
  return (
    <main className="min-h-screen bg-gray-50 p-5 md:p-10">
      <header className="mb-6">
        <Breadcrumbs items={[{ label: "Inventory", href: "/inventory" }, { label: "Material remnants" }]} />
        <h1 className="text-2xl font-bold">Material remnants</h1>
        <p className="mt-1 text-sm text-gray-600">Track reusable material leftovers separately from regular stock, with a complete movement history.</p>
      </header>
      <RemnantManager canManage={canManage} />
    </main>
  );
}
