import { redirect } from "next/navigation";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { ProductDetails } from "../product-details";

type Props = { params: Promise<{ id: string }> };

export default async function ProductDetailsPage({ params }: Props) {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  const { id } = await params;
  const canManage = (await getInventoryAccess("inventory.manage")).ok;
  return <ProductDetails productId={id} canManage={canManage} />;
}
