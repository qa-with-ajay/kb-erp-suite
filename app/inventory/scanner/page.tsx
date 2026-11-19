import { redirect } from "next/navigation";
import Link from "next/link";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { BarcodeLookup } from "./scanner-lookup";

export default async function InventoryScannerPage() {
  const access = await getInventoryAccess("inventory.read");
  if (!access.ok) redirect(access.status === 401 ? "/login" : "/dashboard");
  return <main className="min-h-screen p-5 md:p-10"><header className="mb-6"><p className="text-sm text-gray-500"><Link href="/inventory" className="hover:underline">Inventory</Link> / Scanner</p><h1 className="mt-2 text-2xl font-bold">Barcode & QR scanner</h1><p className="mt-1 text-sm text-gray-600">Scan a product barcode, internal QR code, or SKU in {access.context.businessUnit.name}.</p></header><BarcodeLookup /></main>;
}
