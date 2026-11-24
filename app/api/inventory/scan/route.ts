import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

export async function GET(request: Request) {
  let access = await getBusinessUnitAccess("inventory.read");
  if (!access.ok) access = await getBusinessUnitAccess("billing.read");
  if (!access.ok) access = await getBusinessUnitAccess("purchases.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const locationId = url.searchParams.get("locationId");
  if (!code || code.length > 128) return NextResponse.json({ error: "Enter a valid barcode, QR value, or SKU." }, { status: 400 });
  if (locationId) {
    const location = await prisma.stockLocation.findFirst({ where: { id: locationId, businessUnitId: access.context.businessUnit.id, isActive: true }, select: { id: true } });
    if (!location) return NextResponse.json({ error: "The selected stock location is not available in this business unit." }, { status: 400 });
  }

  const qrCandidate = code.startsWith("KBERP:PRODUCT:") ? code.slice("KBERP:PRODUCT:".length) : null;
  const qrProductId = qrCandidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(qrCandidate) ? qrCandidate : null;
  const matches = await prisma.product.findMany({
    where: {
      businessUnitId: access.context.businessUnit.id,
      isActive: true,
      OR: [
        ...(qrProductId ? [{ id: qrProductId }] : []),
        { sku: { equals: code, mode: "insensitive" } },
        { barcode: code },
        { variants: { some: { isActive: true, OR: [{ barcode: code }, { code: { equals: code, mode: "insensitive" } }] } } },
      ],
    },
    select: {
      id: true, name: true, sku: true, barcode: true, baseUnit: true, materialUnit: true,
      materialUnitsPerBaseUnit: true, isProcessingEnabled: true, productType: true, purchasePrice: true, sellingPrice: true, gstPercentage: true,
      variants: { where: { isActive: true }, select: { id: true, code: true, barcode: true, attributes: true }, orderBy: { createdAt: "asc" } },
      unitConversions: { where: { OR: [{ isPurchaseUnit: true }, { isSalesUnit: true }] }, select: { unit: true, conversionFactor: true, precision: true, roundingMode: true } },
      stockBalances: { where: { ...(locationId ? { locationId } : {}), stockKind: "STANDARD", quantity: { gt: 0 } }, select: { id: true, locationId: true, variantId: true, quantity: true, averageCost: true } },
      materialRemnants: { where: { ...(locationId ? { locationId } : {}), status: "AVAILABLE", quantity: { gt: 0 } }, select: { id: true, code: true, variantId: true, quantity: true, unit: true, unitCost: true }, orderBy: { createdAt: "asc" } },
    },
    take: 2,
  });
  if (matches.length > 1) return NextResponse.json({ error: "This code is assigned to more than one product or variant. Correct the duplicate barcode before scanning." }, { status: 409 });
  const product = matches[0];
  if (!product) return NextResponse.json({ error: `No active product found for “${code}” in ${access.context.businessUnit.name}.` }, { status: 404 });
  const matchedVariant = product.variants.find((variant) => variant.barcode === code || variant.code?.toLowerCase() === code.toLowerCase()) ?? null;
  return NextResponse.json({ product, matchedVariantId: matchedVariant?.id ?? null, businessUnit: access.context.businessUnit.name });
}
