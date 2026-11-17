import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";
import { readJsonBody } from "@/lib/catalog-validation";
import { parsePartyList, partyCreateSchema, partyPatchSchema } from "@/lib/party-validation";
import { z } from "zod";

export type PartyResource = "customers" | "suppliers";

function permissionFor(resource: PartyResource) {
  return resource === "customers" ? "customers.manage" : "suppliers.manage";
}

function entityFor(resource: PartyResource) {
  return resource === "customers" ? "Customer" : "Supplier";
}

function normalizePartyFields(data: z.infer<typeof partyCreateSchema>) {
  return {
    name: data.name,
    phone: data.phone || null,
    email: data.email || null,
    gstin: data.gstin || null,
    addressLine1: data.addressLine1 || null,
    city: data.city || null,
    state: data.state || null,
    pincode: data.pincode || null,
  };
}

export async function listParties(request: Request, resource: PartyResource) {
  const access = await getBusinessUnitAccess(permissionFor(resource));
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = parsePartyList(new URL(request.url).searchParams);
  if (!parsed.success) return NextResponse.json({ error: "Invalid party filters." }, { status: 400 });
  const params = parsed.data;
  const filters = {
    businessUnitId: access.context.businessUnit.id,
    ...(params.search ? {
      OR: [
        { name: { contains: params.search, mode: "insensitive" as const } },
        { phone: { contains: params.search, mode: "insensitive" as const } },
        { email: { contains: params.search, mode: "insensitive" as const } },
        { gstin: { contains: params.search, mode: "insensitive" as const } },
      ],
    } : {}),
    ...(params.active === "all" ? {} : { isActive: params.active === "true" }),
  };
  if (resource === "customers") {
    const where: Prisma.CustomerWhereInput = filters;
    const [items, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      prisma.customer.count({ where }),
    ]);
    return NextResponse.json({ items, total, page: params.page, pageSize: params.pageSize });
  }
  const where: Prisma.SupplierWhereInput = filters;
  const [items, total] = await prisma.$transaction([
    prisma.supplier.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.supplier.count({ where }),
  ]);
  return NextResponse.json({ items, total, page: params.page, pageSize: params.pageSize });
}

export async function createParty(request: Request, resource: PartyResource) {
  const access = await getBusinessUnitAccess(permissionFor(resource));
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = partyCreateSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid party details.", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = normalizePartyFields(parsed.data);
  const { session, businessUnit } = access.context;
  const item = await prisma.$transaction(async (tx) => {
    const created = resource === "customers"
      ? await tx.customer.create({ data: { businessUnitId: businessUnit.id, ...data } })
      : await tx.supplier.create({ data: { businessUnitId: businessUnit.id, ...data } });
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        businessUnitId: businessUnit.id,
        action: "CREATE",
        entity: entityFor(resource),
        entityId: created.id,
        details: { name: created.name },
      },
    });
    return created;
  });
  return NextResponse.json(item, { status: 201 });
}

export async function updateParty(request: Request, resource: PartyResource, id: string) {
  const access = await getBusinessUnitAccess(permissionFor(resource));
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid record identifier." }, { status: 400 });
  const body = await readJsonBody(request);
  if (!body.success) return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  const parsed = partyPatchSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid party update.", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = {
    ...parsed.data,
    ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
    ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
    ...(parsed.data.gstin !== undefined ? { gstin: parsed.data.gstin || null } : {}),
    ...(parsed.data.addressLine1 !== undefined ? { addressLine1: parsed.data.addressLine1 || null } : {}),
    ...(parsed.data.city !== undefined ? { city: parsed.data.city || null } : {}),
    ...(parsed.data.state !== undefined ? { state: parsed.data.state || null } : {}),
    ...(parsed.data.pincode !== undefined ? { pincode: parsed.data.pincode || null } : {}),
  };
  const { session, businessUnit } = access.context;
  try {
    const item = await prisma.$transaction(async (tx) => {
      const updated = resource === "customers"
        ? await tx.customer.update({
          where: { businessUnitId_id: { businessUnitId: businessUnit.id, id } },
          data,
        })
        : await tx.supplier.update({
          where: { businessUnitId_id: { businessUnitId: businessUnit.id, id } },
          data,
        });
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          businessUnitId: businessUnit.id,
          action: "UPDATE",
          entity: entityFor(resource),
          entityId: id,
          details: parsed.data,
        },
      });
      return updated;
    });
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: `${resource === "customers" ? "Customer" : "Supplier"} not found in this business unit.` }, { status: 404 });
    }
    throw error;
  }
}
