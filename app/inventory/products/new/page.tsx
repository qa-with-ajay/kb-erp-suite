import { redirect } from "next/navigation";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/inventory/products");
  return <ProductForm />;
}
