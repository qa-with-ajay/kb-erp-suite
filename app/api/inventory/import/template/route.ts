import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { IMPORT_HEADERS } from "@/lib/inventory-import";

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET() {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { businessUnit } = access.context;
  const locations = await prisma.stockLocation.findMany({
    where: { businessUnitId: businessUnit.id, isActive: true },
    select: { name: true },
    orderBy: { name: "asc" },
    take: 2,
  });
  const firstLocation = locations[0]?.name ?? "";
  const secondLocation = locations[1]?.name ?? firstLocation;
  const product = ["KB-SAMPLE-001", "Sample PVC Panel", "", "PANEL", "PCS", "650.00", "18", "10", "Wall Panels", "Sample Brand", "", "INTERNAL"];
  const rows = [
    [...product, "100", "450.00", firstLocation, "SUP-INV-001"],
    ...(secondLocation && secondLocation !== firstLocation
      ? [[...product, "25", "450.00", secondLocation, "SUP-INV-001"]]
      : []),
  ];
  const csv = [
    IMPORT_HEADERS.map(csvCell).join(","),
    ...rows.map((row) => row.map((value) => csvCell(String(value))).join(",")),
  ].join("\n") + "\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kb-erp-inventory-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
