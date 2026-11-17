import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { ProductList } from "./product-list";

export default async function ProductsPage() {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const canManage = (await getInventoryAccess("inventory.manage")).ok;

  return (
    <main className="min-h-screen p-5 md:p-10">
      <header className="mb-6">
        <Breadcrumbs items={[{ label: "Inventory", href: "/inventory" }, { label: "Products" }]} />
        <h1 className="text-2xl font-bold">Products</h1>
        <p className="mt-1 text-sm text-gray-600">Manage product details, variants, and units.</p>
      </header>
      <ProductList canManage={canManage} />
    </main>
  );
}
