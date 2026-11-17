import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getAvailableBusinessUnits, ACTIVE_BUSINESS_UNIT_COOKIE } from "@/lib/inventory-auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const units = await getAvailableBusinessUnits(session.user.id);
  const savedUnitId = (await cookies()).get(ACTIVE_BUSINESS_UNIT_COOKIE)?.value;
  const activeBusinessUnitId = units.some(({ id }) => id === savedUnitId)
    ? savedUnitId
    : (units.find(({ code }) => code === "KB_INTERIORS") ?? units[0])?.id ?? null;

  return NextResponse.json({ items: units, activeBusinessUnitId });
}
