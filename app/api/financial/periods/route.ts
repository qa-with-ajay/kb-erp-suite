import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

export async function GET() {
  const access = await getBusinessUnitAccess("accounting.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const periods = await prisma.accountingPeriod.findMany({
    where: { businessUnitId: access.context.businessUnit.id },
    include: { _count: { select: { journalEntries: true } } },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json({ periods });
}
