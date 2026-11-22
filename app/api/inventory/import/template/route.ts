import { NextResponse } from "next/server";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { IMPORT_HEADERS } from "@/lib/inventory-import";

export async function GET() {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const csv = IMPORT_HEADERS.join(",") + "\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kb-erp-inventory-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
