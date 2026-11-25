import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { createParty, listParties } from "@/lib/party-api";

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const phone = url.searchParams.get("phone");
  if (phone !== null) {
    const access = await getBusinessUnitAccess("customers.manage");
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    const normalized = normalizePhone(phone);
    if (!/^\d{10}$/.test(normalized)) return NextResponse.json({ items: [] });
    const candidates = await prisma.customer.findMany({
      where: { businessUnitId: access.context.businessUnit.id, isActive: true, phone: { contains: normalized.slice(-4) } },
      select: { id: true, name: true, phone: true }, take: 50,
    });
    const items = candidates.filter((item) => item.phone && normalizePhone(item.phone) === normalized);
    return NextResponse.json({ items });
  }
  return listParties(request, "customers");
}

export async function POST(request: Request) {
  return createParty(request, "customers");
}
