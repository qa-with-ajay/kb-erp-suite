import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

export async function GET() {
  const access = await getBusinessUnitAccess("cashbank.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const accounts = await prisma.account.findMany({
    where: { businessUnitId: access.context.businessUnit.id, isActive: true, isControlAccount: false },
    select: { id: true, code: true, name: true, type: true, isActive: true, isControlAccount: true },
    orderBy: { code: "asc" },
  });
  return NextResponse.json({ accounts });
}
