import { redirect } from "next/navigation";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { ProductForm } from "../../product-form";

type Props = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: Props) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/inventory/products");
  const { id } = await params;
  return <ProductForm productId={id} />;
}
