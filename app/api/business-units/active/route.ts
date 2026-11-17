import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAvailableBusinessUnits, ACTIVE_BUSINESS_UNIT_COOKIE } from "@/lib/inventory-auth";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    throw error;
  }
  if (!body || typeof body !== "object" || !("businessUnitId" in body) || typeof body.businessUnitId !== "string" || !uuidPattern.test(body.businessUnitId)) {
    return NextResponse.json({ error: "A valid business unit ID is required." }, { status: 400 });
  }

  const units = await getAvailableBusinessUnits(session.user.id);
  if (!units.some(({ id }) => id === body.businessUnitId)) {
    return NextResponse.json({ error: "You do not have access to this business unit." }, { status: 403 });
  }

  const response = NextResponse.json({ activeBusinessUnitId: body.businessUnitId });
  response.cookies.set(ACTIVE_BUSINESS_UNIT_COOKIE, body.businessUnitId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
