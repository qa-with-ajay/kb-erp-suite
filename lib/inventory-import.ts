import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { createStockMovement } from "@/lib/stock-service";

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 1_000_000;

export const IMPORT_HEADERS = [
  "sku", "name", "description", "productType", "baseUnit", "purchasePrice", "sellingPrice",
  "gstPercentage", "minimumStock", "category", "brand", "barcode",
  "barcodeType", "inwardQuantity", "inwardUnitCost", "inwardLocation", "inwardReference",
] as const;

export type InventoryImportRow = {
  rowNumber: number;
  sku: string;
  name: string;
  description: string | null;
  productType: "STANDARD" | "PANEL";
  baseUnit: "PCS" | "SQFT" | "BOX" | "RFT" | "ROLL" | "METER" | "KG" | "LITRE" | "BUNDLE" | "SET";
  purchasePrice: string;
  sellingPrice: string;
  gstPercentage: string;
  minimumStock: string;
  category: string | null;
  brand: string | null;
  barcode: string | null;
  barcodeType: "INTERNAL" | "MANUFACTURER";
  inwardQuantity: string;
  inwardUnitCost: string;
  inwardLocation: string | null;
  inwardReference: string | null;
};

export type ImportIssue = { rowNumber: number; field: string; message: string };
export type ValidatedImportRow = InventoryImportRow & {
  action: "CREATE" | "UPDATE";
  existingProductId: string | null;
  inwardLocationId: string | null;
  inwardMovementAlreadyExists: boolean;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value.trim()); value = "";
    } else value += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  cells.push(value.trim());
  return cells;
}

export function parseInventoryCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim());
  if (lines.length < 2) throw new Error("The CSV must contain a header and at least one product row.");
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const normalized = headers.map((header) => header.toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw new Error("CSV contains duplicate column headers.");
  const missing = ["sku", "name", "producttype", "baseunit", "purchaseprice", "sellingprice"]
    .filter((header) => !normalized.includes(header));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}.`);
  if (lines.length - 1 > MAX_IMPORT_ROWS) throw new Error(`A maximum of ${MAX_IMPORT_ROWS} product rows is allowed per import.`);
  const rows = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const record: Record<string, string> = {};
    normalized.forEach((header, column) => { record[header] = cells[column] ?? ""; });
    return { rowNumber: index + 2, record };
  });
  return rows;
}

const allowedUnits = new Set(["PCS", "SQFT", "BOX", "RFT", "ROLL", "METER", "KG", "LITRE", "BUNDLE", "SET"]);
const money = /^\d{1,12}(?:\.\d{1,2})?$/;
const quantity = /^\d{1,10}(?:\.\d{1,4})?$/;
const skuPattern = /^[A-Za-z0-9._/-]{1,80}$/;

export type InventoryStockMode = "PRODUCTS_ONLY" | "INWARD";

export async function validateInventoryImport(db: any, businessUnitId: string, text: string, updateExisting: boolean, stockMode: InventoryStockMode = "PRODUCTS_ONLY") {
  const parsed = parseInventoryCsv(text);
  const issues: ImportIssue[] = [];
  const rows: ValidatedImportRow[] = [];
  const seenSkus = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();
  const skuValues = parsed.map(({ record }) => record.sku?.trim()).filter(Boolean);
  const barcodeValues = parsed.map(({ record }) => record.barcode?.trim()).filter(Boolean);

  const [products, categories, brands, locations] = await Promise.all([
    db.product.findMany({ where: { businessUnitId, OR: skuValues.map((sku: string) => ({ sku: { equals: sku, mode: "insensitive" } })) }, select: { id: true, sku: true, barcode: true, baseUnit: true, productType: true } }),
    db.category.findMany({ where: { businessUnitId, isActive: true }, select: { id: true, name: true } }),
    db.brand.findMany({ where: { businessUnitId, isActive: true }, select: { id: true, name: true } }),
    db.stockLocation.findMany({ where: { businessUnitId, isActive: true }, select: { id: true, name: true } }),
  ]);
  const productBySku = new Map<string, any>(products.map((item: any) => [item.sku.toLowerCase(), item] as [string, any]));
  const categoryNames = new Map<string, string>(categories.map((item: any) => [item.name.toLowerCase(), item.id] as [string, string]));
  const brandNames = new Map<string, string>(brands.map((item: any) => [item.name.toLowerCase(), item.id] as [string, string]));
  const locationNames = new Map<string, string>(locations.map((item: any) => [item.name.toLowerCase(), item.id] as [string, string]));

  const addIssue = (rowNumber: number, field: string, message: string) => issues.push({ rowNumber, field, message });

  for (const { rowNumber, record } of parsed) {
    const sku = (record.sku ?? "").trim();
    const name = (record.name ?? "").trim();
    const description = (record.description ?? "").trim() || null;
    const productType = (record.producttype || "STANDARD").trim().toUpperCase();
    const baseUnit = (record.baseunit || "PCS").trim().toUpperCase();
    const purchasePrice = (record.purchaseprice ?? "").trim();
    const sellingPrice = (record.sellingprice ?? "").trim();
    const gstPercentage = (record.gstpercentage || "0").trim();
    const minimumStock = (record.minimumstock || "0").trim();
    const category = (record.category || "").trim() || null;
    const brand = (record.brand || "").trim() || null;
    const barcode = (record.barcode || "").trim() || null;
    const barcodeType = (record.barcodetype || (barcode ? "MANUFACTURER" : "INTERNAL")).trim().toUpperCase();
    const inwardQuantity = (record.inwardquantity || "0").trim();
    const inwardUnitCost = (record.inwardunitcost || purchasePrice || "0").trim();
    const inwardLocation = (record.inwardlocation || "").trim() || null;
    const inwardReference = (record.inwardreference || "").trim() || null;

    if (!skuPattern.test(sku)) addIssue(rowNumber, "sku", "SKU is required; use up to 80 letters, numbers, dot, dash, slash or underscore.");
    const normalizedSku = sku.toLowerCase();
    if (sku && seenSkus.has(normalizedSku)) addIssue(rowNumber, "sku", `Duplicate SKU in file (also row ${seenSkus.get(normalizedSku)}).`);
    if (sku) seenSkus.set(normalizedSku, rowNumber);
    if (!name || name.length > 160) addIssue(rowNumber, "name", "Product name is required and must be at most 160 characters.");
    if (description && description.length > 2000) addIssue(rowNumber, "description", "Description must be at most 2,000 characters.");
    if (!["STANDARD", "PANEL"].includes(productType)) addIssue(rowNumber, "productType", "Use STANDARD or PANEL.");
    if (!allowedUnits.has(baseUnit)) addIssue(rowNumber, "baseUnit", "Unsupported unit of measurement.");
    if (productType === "PANEL" && !["PCS", "SQFT"].includes(baseUnit)) addIssue(rowNumber, "baseUnit", "Panel products must use PCS for whole-sheet sales or SQFT for cut-to-size stock.");
    if (!money.test(purchasePrice)) addIssue(rowNumber, "purchasePrice", "Enter a non-negative price with up to 2 decimal places.");
    if (!money.test(sellingPrice)) addIssue(rowNumber, "sellingPrice", "Enter a non-negative price with up to 2 decimal places.");
    if (!/^\d{1,2}(?:\.\d{1,2})?$|^100(?:\.0{1,2})?$/.test(gstPercentage) || Number(gstPercentage) > 100) addIssue(rowNumber, "gstPercentage", "GST must be between 0 and 100.");
    if (!quantity.test(minimumStock)) addIssue(rowNumber, "minimumStock", "Enter a non-negative quantity with up to 4 decimal places.");
    if (!quantity.test(inwardQuantity)) addIssue(rowNumber, "inwardQuantity", "Enter a non-negative inward quantity with up to 4 decimal places.");
    if (!money.test(inwardUnitCost)) addIssue(rowNumber, "inwardUnitCost", "Enter a non-negative inward unit cost.");
    if (stockMode === "INWARD" && Number(inwardQuantity) > 0) {
      if (!inwardLocation) addIssue(rowNumber, "inwardLocation", "Select a stock location when inward quantity is greater than zero.");
      if (!inwardReference) addIssue(rowNumber, "inwardReference", "A stock inward reference is required for duplicate-import protection (for example, supplier invoice number).");
      if (inwardReference && inwardReference.length > 100) addIssue(rowNumber, "inwardReference", "Inward reference must be at most 100 characters.");
    }
    if (!["INTERNAL", "MANUFACTURER"].includes(barcodeType)) addIssue(rowNumber, "barcodeType", "Use INTERNAL or MANUFACTURER.");
    if (barcodeType === "MANUFACTURER" && !barcode) addIssue(rowNumber, "barcode", "Manufacturer barcode is required.");
    if (barcode && barcode.length > 100) addIssue(rowNumber, "barcode", "Barcode must be at most 100 characters.");
    if (barcode) {
      const normalizedBarcode = barcode.toLowerCase();
      if (seenBarcodes.has(normalizedBarcode)) addIssue(rowNumber, "barcode", `Duplicate barcode in file (also row ${seenBarcodes.get(normalizedBarcode)}).`);
      seenBarcodes.set(normalizedBarcode, rowNumber);
    }

    const existing = sku ? productBySku.get(normalizedSku) : null;
    if (existing && !updateExisting) addIssue(rowNumber, "sku", "SKU already exists. Enable update existing products to update it.");
    if (existing && updateExisting && existing.baseUnit !== baseUnit) {
      const ledgerCount = await db.stockLedgerEntry.count({ where: { businessUnitId, productId: existing.id } });
      const conversionCount = await db.productUnitConversion.count({ where: { businessUnitId, productId: existing.id } });
      if (ledgerCount || conversionCount) addIssue(rowNumber, "baseUnit", "Base unit cannot change after stock ledger entries or unit conversions exist.");
    }
    if (existing && existing.productType !== productType && productType === "PANEL" && !["PCS", "SQFT"].includes(baseUnit)) {
      addIssue(rowNumber, "productType", "Panel products must use PCS for whole-sheet sales or SQFT for cut-to-size stock.");
    }
    if (barcode) {
      const duplicateBarcode = await db.product.findFirst({ where: { businessUnitId, barcode, ...(existing ? { id: { not: existing.id } } : {}) }, select: { id: true } });
      if (duplicateBarcode) addIssue(rowNumber, "barcode", "Barcode is already assigned to another product in this business unit.");
    }

    let inwardLocationId: string | null = null;
    let inwardMovementAlreadyExists = false;
    if (stockMode === "INWARD" && Number(inwardQuantity) > 0 && inwardLocation) {
      inwardLocationId = locationNames.get(inwardLocation.toLowerCase()) ?? null;
      if (!inwardLocationId) addIssue(rowNumber, "inwardLocation", "Stock location was not found in this business unit.");
      if (inwardReference && inwardLocationId) {
        const idempotencyKey = createHash("sha256").update(`${businessUnitId}:INWARD:${inwardReference.trim().toLowerCase()}:${sku.toLowerCase()}:${inwardLocationId}`).digest("hex");
        const prior = await db.stockMovement.findUnique({
          where: { businessUnitId_idempotencyKey: { businessUnitId, idempotencyKey } },
          select: { id: true },
        });
        inwardMovementAlreadyExists = Boolean(prior);
      }
    }

    rows.push({
      rowNumber, sku, name, description, productType: productType as InventoryImportRow["productType"],
      baseUnit: baseUnit as InventoryImportRow["baseUnit"], purchasePrice, sellingPrice,
      gstPercentage, minimumStock, category, brand, barcode,
      barcodeType: barcodeType as InventoryImportRow["barcodeType"],
      inwardQuantity, inwardUnitCost, inwardLocation, inwardReference,
      action: existing ? "UPDATE" : "CREATE",
      existingProductId: existing?.id ?? null,
      inwardLocationId, inwardMovementAlreadyExists,
    });
  }

  return { rows, issues, summary: {
    totalRows: rows.length,
    validRows: rows.length - new Set(issues.map((issue) => issue.rowNumber)).size,
    invalidRows: new Set(issues.map((issue) => issue.rowNumber)).size,
    newProducts: rows.filter((row) => row.action === "CREATE").length,
    existingProducts: rows.filter((row) => row.action === "UPDATE").length,
    inwardStockRows: stockMode === "INWARD" ? rows.filter((row) => Number(row.inwardQuantity) > 0).length : 0,
    inwardStockAlreadyImported: rows.filter((row) => row.inwardMovementAlreadyExists).length,
  }};
}

export async function applyInventoryImport(tx: Prisma.TransactionClient, businessUnitId: string, actorId: string, rows: ValidatedImportRow[], stockMode: InventoryStockMode = "PRODUCTS_ONLY") {
  let created = 0;
  let updated = 0;
  let inwardStockCreated = 0;
  let inwardStockReplayed = 0;

  for (const row of rows) {
    let categoryId: string | null = null;
    let brandId: string | null = null;
    if (row.category) {
      const existingCategory = await tx.category.findFirst({
        where: { businessUnitId, name: { equals: row.category, mode: "insensitive" } },
        select: { id: true, isActive: true },
      });
      if (existingCategory && !existingCategory.isActive) throw new Error(`Category "${row.category}" is inactive. Activate it before importing.`);
      const category = existingCategory ?? await tx.category.create({ data: { businessUnitId, name: row.category }, select: { id: true } });
      categoryId = category.id;
    }
    if (row.brand) {
      const existingBrand = await tx.brand.findFirst({
        where: { businessUnitId, name: { equals: row.brand, mode: "insensitive" } },
        select: { id: true, isActive: true },
      });
      if (existingBrand && !existingBrand.isActive) throw new Error(`Brand "${row.brand}" is inactive. Activate it before importing.`);
      const brand = existingBrand ?? await tx.brand.create({ data: { businessUnitId, name: row.brand }, select: { id: true } });
      brandId = brand.id;
    }

    const fields = {
      name: row.name,
      sku: row.sku,
      description: row.description,
      productType: row.productType,
      baseUnit: row.baseUnit,
      purchasePrice: new Prisma.Decimal(row.purchasePrice),
      sellingPrice: new Prisma.Decimal(row.sellingPrice),
      gstPercentage: new Prisma.Decimal(row.gstPercentage),
      minimumStock: new Prisma.Decimal(row.minimumStock),
      categoryId,
      brandId,
      barcodeType: row.barcodeType,
      ...(row.barcodeType === "MANUFACTURER" ? { barcode: row.barcode } : {}),
    };
    let productId = row.existingProductId;
    if (productId) {
      const current = await tx.product.findFirst({ where: { id: productId, businessUnitId }, select: { barcode: true, barcodeType: true } });
      if (!current) throw new Error(`Product with SKU ${row.sku} changed during import. Preview the file again.`);
      await tx.product.update({ where: { id: productId }, data: {
        ...fields,
        barcode: row.barcodeType === "MANUFACTURER" ? row.barcode : (current.barcodeType === "INTERNAL" ? current.barcode : `KB${randomUUID().replace(/-/g, "").toUpperCase()}`),
      }});
      updated += 1;
    } else {
      const id = randomUUID();
      const barcode = row.barcodeType === "INTERNAL" ? `KB${id.replace(/-/g, "").toUpperCase()}` : row.barcode;
      const product = await tx.product.create({ data: { id, businessUnitId, ...fields, barcode } });
      productId = product.id;
      created += 1;
    }

    if (stockMode === "INWARD" && Number(row.inwardQuantity) > 0 && row.inwardLocationId && row.inwardReference) {
      const idempotencyKey = createHash("sha256").update(`${businessUnitId}:INWARD:${row.inwardReference.trim().toLowerCase()}:${row.sku.toLowerCase()}:${row.inwardLocationId}`).digest("hex");
      const result = await createStockMovement(tx, businessUnitId, actorId, {
        type: "INWARD",
        locationId: row.inwardLocationId,
        productId: productId!,
        quantity: row.inwardQuantity,
        unitCost: row.inwardUnitCost,
        reference: row.inwardReference,
        reason: "Stock inward recorded during bulk inventory import.",
        idempotencyKey,
      });
      if (result.kind === "error") throw new Error(`Stock inward failed for SKU ${row.sku}: ${result.error}.`);
      if (result.kind === "created") inwardStockCreated += 1;
      else inwardStockReplayed += 1;
    }
    await tx.auditLog.create({
      data: {
        userId: actorId, businessUnitId, action: row.action === "CREATE" ? "CREATE" : "UPDATE",
        entity: "Product", entityId: productId!,
        details: { source: "BULK_IMPORT", sku: row.sku, rowNumber: row.rowNumber },
      },
    });
  }
  await tx.auditLog.create({
    data: {
      userId: actorId, businessUnitId, action: "IMPORT", entity: "InventoryImport",
      details: { totalRows: rows.length, stockMode, created, updated, inwardStockCreated, inwardStockReplayed },
    },
  });
  return { totalRows: rows.length, stockMode, created, updated, inwardStockCreated, inwardStockReplayed };
}
