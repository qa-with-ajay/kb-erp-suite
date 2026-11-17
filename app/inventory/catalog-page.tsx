import { redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { CatalogManager } from "./catalog-manager";

type Props = {
  resource: "categories" | "brands";
  title: string;
  hasDescription?: boolean;
};

export async function CatalogPage({ resource, title, hasDescription }: Props) {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const canManage = (await getInventoryAccess("inventory.manage")).ok;

  return (
    <main className="min-h-screen p-5 md:p-10">
      <header className="mb-6">
        <Breadcrumbs items={[{ label: "Inventory", href: "/inventory" }, { label: title }]} />
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-gray-600">Search, filter, and maintain inventory {title.toLowerCase()}.</p>
      </header>
      <CatalogManager
        resource={resource}
        title={title}
        hasDescription={hasDescription}
        canManage={canManage}
      />
    </main>
  );
}
