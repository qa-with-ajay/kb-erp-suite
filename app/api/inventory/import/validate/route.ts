import { NextResponse } from "next/server";
import { getInventoryAccess } from "@/lib/inventory-auth";
import { prisma } from "@/lib/prisma";
import { validateInventoryImport, MAX_IMPORT_BYTES } from "@/lib/inventory-import";

export const runtime = "nodejs";

async function readUpload(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const updateExisting = form.get("updateExisting") === "true";
  const rawStockMode = form.get("stockMode");
  const stockMode = typeof rawStockMode === "string" ? rawStockMode : "PRODUCTS_ONLY";
  if (!["PRODUCTS_ONLY", "INWARD"].includes(stockMode)) throw new Error("Choose a valid stock import mode.");
  if (!(file instanceof File)) throw new Error("Choose a CSV file to upload.");
  if (!file.name.toLowerCase().endsWith(".csv") || file.type && !["text/csv", "application/vnd.ms-excel", "application/octet-stream"].includes(file.type)) {
    throw new Error("Only CSV files are supported in this release.");
  }
  if (file.size === 0 || file.size > MAX_IMPORT_BYTES) throw new Error("CSV file must be between 1 byte and 1 MB.");
  const text = await file.text();
  return { text, updateExisting, stockMode: stockMode as "PRODUCTS_ONLY" | "INWARD" };
}

export async function POST(request: Request) {
  const access = await getInventoryAccess("inventory.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const { text, updateExisting, stockMode } = await readUpload(request);
    const result = await validateInventoryImport(prisma, access.context.businessUnit.id, text, updateExisting, stockMode);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to validate CSV." }, { status: 400 });
  }
}
