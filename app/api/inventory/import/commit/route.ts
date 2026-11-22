import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";
import { applyInventoryImport, validateInventoryImport, MAX_IMPORT_BYTES } from "@/lib/inventory-import";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const form = await request.formData();
    const file = form.get("file");
    const updateExisting = form.get("updateExisting") === "true";
    const stockMode = form.get("stockMode") || "PRODUCTS_ONLY";
    if (!["PRODUCTS_ONLY", "OPENING", "INWARD"].includes(stockMode)) return NextResponse.json({ error: "Choose a valid stock import mode." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CSV file to import." }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".csv")) return NextResponse.json({ error: "Only CSV files are supported." }, { status: 400 });
    if (file.size === 0 || file.size > MAX_IMPORT_BYTES) return NextResponse.json({ error: "CSV file must be between 1 byte and 1 MB." }, { status: 400 });
    const text = await file.text();
    const { session, businessUnit } = access.context;

    const result = await prisma.$transaction(async (tx) => {
      const mode = stockMode as "PRODUCTS_ONLY" | "OPENING" | "INWARD";
      const validation = await validateInventoryImport(tx, businessUnit.id, text, updateExisting, mode);
      if (validation.issues.length) {
        return { kind: "invalid" as const, validation };
      }
      const imported = await applyInventoryImport(tx, businessUnit.id, session.user.id, validation.rows, mode);
      return { kind: "success" as const, imported };
    }, { maxWait: 10000, timeout: 120000 });

    if (result.kind === "invalid") {
      return NextResponse.json({ error: "The file has validation errors. Review the preview and try again.", issues: result.validation.issues, summary: result.validation.summary }, { status: 422 });
    }
    return NextResponse.json(result.imported, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A SKU or barcode conflicts with another product. Refresh the preview and correct the file." }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import inventory. No records were committed." }, { status: 400 });
  }
}
