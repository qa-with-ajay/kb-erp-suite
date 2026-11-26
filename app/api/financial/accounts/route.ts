import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { accountInputSchema } from "@/lib/accounting-validation";

export async function GET(request: Request) {
  const access = await getBusinessUnitAccess("accounting.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const search = new URL(request.url).searchParams.get("search")?.trim();
  const accounts = await prisma.account.findMany({
    where: {
      businessUnitId: access.context.businessUnit.id,
      ...(search ? { OR: [{ code: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] } : {}),
    },
    select: {
      id: true, code: true, name: true, type: true, description: true,
      parentAccountId: true, isSystem: true, isControlAccount: true, isActive: true,
      _count: { select: { journalLines: true, children: true } },
      parent: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ code: "asc" }],
  });
  return NextResponse.json({ accounts });
}

export async function POST(request: Request) {
  const access = await getBusinessUnitAccess("accounting.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = accountInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid account details.", details: parsed.error.flatten() }, { status: 400 });

  const businessUnitId = access.context.businessUnit.id;
  try {
    const account = await prisma.$transaction(async (tx) => {
      if (parsed.data.parentAccountId) {
        const parent = await tx.account.findFirst({
          where: { id: parsed.data.parentAccountId, businessUnitId, isActive: true },
          select: { id: true, type: true },
        });
        if (!parent) throw new Error("PARENT_ACCOUNT_NOT_FOUND");
        if (parent.type !== parsed.data.type) throw new Error("PARENT_ACCOUNT_TYPE_MISMATCH");
      }
      const created = await tx.account.create({
        data: {
          businessUnitId, code: parsed.data.code.toUpperCase(), name: parsed.data.name,
          type: parsed.data.type, description: parsed.data.description || null,
          parentAccountId: parsed.data.parentAccountId || null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: access.context.session.user.id, businessUnitId, action: "CREATE",
          entity: "Account", entityId: created.id,
          details: { code: created.code, name: created.name, type: created.type },
        },
      });
      return created;
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PARENT_ACCOUNT_NOT_FOUND") return NextResponse.json({ error: "Select an active parent account in this business unit." }, { status: 400 });
    if (error instanceof Error && error.message === "PARENT_ACCOUNT_TYPE_MISMATCH") return NextResponse.json({ error: "A child account must use the same account type as its parent." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "An account with this code already exists." }, { status: 409 });
    throw error;
  }
}
