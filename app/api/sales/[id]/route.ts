import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getBusinessUnitAccess } from "@/lib/inventory-auth";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getBusinessUnitAccess("billing.read");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid invoice identifier." }, { status: 400 });

  const sale = await prisma.sale.findFirst({
    where: { id, businessUnitId: access.context.businessUnit.id },
    select: {
      id: true,
      invoiceNumber: true,
      taxMode: true,
      customerName: true,
      customerPhone: true,
      subtotal: true,
      taxAmount: true,
      total: true,
      createdAt: true,
      creator: { select: { name: true } },
      businessUnit: {
        select: {
          name: true,
          profile: {
            select: {
              legalName: true,
              tradeName: true,
              gstin: true,
              phone: true,
              email: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              state: true,
              pincode: true,
              currency: true,
            },
          },
        },
      },
      stockMovement: {
        select: { sourceLocation: { select: { name: true } } },
      },
      lines: {
        select: {
          id: true,
          lineNumber: true,
          productName: true,
          sku: true,
          baseUnit: true,
          variantCode: true,
          variantAttributes: true,
          quantity: true,
          unitPrice: true,
          gstPercentage: true,
          lineSubtotal: true,
          lineTax: true,
          lineTotal: true,
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });
  if (!sale) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  return NextResponse.json(sale);
}
