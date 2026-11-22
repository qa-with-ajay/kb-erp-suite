import { NextResponse } from "next/server";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { IMPORT_HEADERS } from "@/lib/inventory-import";

export async function GET() {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const csv = [
    IMPORT_HEADERS.join(","),
    "KB-001,Sample PVC Panel,,PANEL,PCS,450.00,650.00,18,10,Wall Panels,Sample Brand,,INTERNAL,100,450.00,Main Store,0,450.00,Main Store,SUP-INV-001",
    "KB-002,Sample LED Bulb,,STANDARD,PCS,70.00,99.00,12,5,Lighting,Sample Brand,8901234567890,MANUFACTURER,50,70.00,Main Store,0,70.00,Main Store,SUP-INV-002",
  ].join("\\n") + "\\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kb-erp-inventory-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
