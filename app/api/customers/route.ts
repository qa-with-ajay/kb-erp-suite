import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { createParty, listParties } from "@/lib/party-api";

function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const search = (params.get("search") ?? "").trim();
  if (!search) return listParties(request, "customers");
  if (search.length < 2) return NextResponse.json({ items: [] });

  const access = await getBusinessUnitAccess("customers.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const phoneDigits = normalizePhone(search);
  const conditions = [
    { name: { contains: search, mode: "insensitive" as const } },
    ...(phoneDigits.length >= 3 ? [{ phone: { contains: phoneDigits } }] : []),
  ];

  const items = await prisma.customer.findMany({
    where: {
      businessUnitId: access.context.businessUnit.id,
      isActive: true,
      OR: conditions,
    },
    select: { id: true, name: true, phone: true },
    take: 20,
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  return createParty(request, "customers");
}
