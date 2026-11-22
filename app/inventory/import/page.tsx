import { redirect } from "next/navigation";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { InventoryImport } from "./inventory-import";

export default async function InventoryImportPage() {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/inventory/products");
  return <InventoryImport />;
}
