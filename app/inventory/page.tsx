import Link from "next/link";
import { redirect } from "next/navigation";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { BusinessUnitSwitcher } from "@/components/business-unit-switcher";

const sections = [
  { title: "Products", description: "Manage products, variants, and units.", href: "/inventory/products" },
  { title: "Categories", description: "Organize products by category.", href: "/inventory/categories" },
  { title: "Brands", description: "Maintain the product brand list.", href: "/inventory/brands" },
  { title: "Stock", description: "Record stock movements and review balances and ledger history.", href: "/inventory/stock" },
];

export default async function InventoryPage() {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const canManage = (await getInventoryAccess("inventory.manage")).ok;

  return (
    <main className="min-h-screen p-5 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="mt-1 text-sm text-gray-600">Catalog management</p>
        </div>
        <BusinessUnitSwitcher />
      </header>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {canManage && <Link href="/inventory/import" className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm transition hover:border-emerald-700"><h2 className="font-semibold text-emerald-950">Bulk Import</h2><p className="mt-2 text-sm text-emerald-800">Upload product catalog and opening stock from a CSV file.</p></Link>}\n        {sections.map((section) => (
          <Link key={section.href} href={section.href} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-emerald-700">
            <h2 className="font-semibold">{section.title}</h2>
            <p className="mt-2 text-sm text-gray-600">{section.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
