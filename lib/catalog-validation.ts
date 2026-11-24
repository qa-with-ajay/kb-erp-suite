import { z } from "zod";

export const catalogInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
});

export const catalogUpdateSchema = catalogInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const catalogListSchema = z.object({
  search: z.string().trim().max(100).default(""),
  active: z.enum(["all", "true", "false"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const measurementUnits = ["PCS", "SQFT", "BOX", "RFT", "ROLL", "METER", "KG", "LITRE", "BUNDLE", "SET"] as const;
const productTypes = ["STANDARD", "MATERIAL"] as const;
const roundingModes = ["HALF_UP", "HALF_EVEN", "DOWN", "UP"] as const;

const moneySchema = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Enter a non-negative amount with up to 2 decimal places.");
const quantitySchema = z.string().trim().regex(/^\d{1,10}(?:\.\d{1,4})?$/, "Enter a non-negative quantity with up to 4 decimal places.");

const productFieldsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(80).regex(/^[A-Za-z0-9._/-]+$/, "Use letters, numbers, dot, dash, slash, or underscore for SKU.").optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  productType: z.enum(productTypes),
  isProcessingEnabled: z.boolean().default(false),
  baseUnit: z.enum(measurementUnits),
  materialUnit: z.enum(measurementUnits).nullable().optional(),
  materialUnitsPerBaseUnit: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,8})?$/).nullable().optional(),
  sellingPrice: moneySchema,
  gstPercentage: z.string().trim().regex(/^(?:\d{1,2})(?:\.\d{1,2})?$|^100(?:\.0{1,2})?$/).default("0"),
  minimumStock: quantitySchema.default("0"),
  categoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  barcode: z.string().trim().max(100).nullable().optional(),
  barcodeType: z.enum(["INTERNAL", "MANUFACTURER"]).optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
});

export const productInputSchema = productFieldsSchema.superRefine((value, context) => {
  if (value.isProcessingEnabled && value.productType !== "MATERIAL") context.addIssue({ code: "custom", path: ["isProcessingEnabled"], message: "Material processing can only be enabled for MATERIAL products." });
  if (Boolean(value.materialUnit) !== Boolean(value.materialUnitsPerBaseUnit)) context.addIssue({ code: "custom", path: ["materialUnit"], message: "Configure both the material unit and units per base unit." });
  if (value.materialUnit && value.materialUnit === value.baseUnit) context.addIssue({ code: "custom", path: ["materialUnit"], message: "Material unit must differ from the base unit." });
  if (value.productType === "STANDARD" && (value.materialUnit || value.materialUnitsPerBaseUnit)) context.addIssue({ code: "custom", path: ["materialUnit"], message: "Convert the product to MATERIAL before configuring a secondary material unit." });
  if ((value.barcodeType ?? (value.barcode ? "MANUFACTURER" : "INTERNAL")) === "MANUFACTURER" && !value.barcode) {
    context.addIssue({ code: "custom", path: ["barcode"], message: "Enter or scan the manufacturer barcode." });
  }
});

export const productUpdateSchema = productFieldsSchema.partial().superRefine((value, context) => {
  if (value.isProcessingEnabled === true && value.productType !== undefined && value.productType !== "MATERIAL") context.addIssue({ code: "custom", path: ["isProcessingEnabled"], message: "Material processing can only be enabled for MATERIAL products." });
  if (value.materialUnit !== undefined && value.materialUnitsPerBaseUnit !== undefined && Boolean(value.materialUnit) !== Boolean(value.materialUnitsPerBaseUnit)) context.addIssue({ code: "custom", path: ["materialUnit"], message: "Configure both the material unit and units per base unit." });
  if (value.materialUnit && value.baseUnit && value.materialUnit === value.baseUnit) context.addIssue({ code: "custom", path: ["materialUnit"], message: "Material unit must differ from the base unit." });
  if (value.productType === "STANDARD" && (value.materialUnit || value.materialUnitsPerBaseUnit)) context.addIssue({ code: "custom", path: ["materialUnit"], message: "Convert the product to MATERIAL before configuring a secondary material unit." });
  if (value.barcodeType === "MANUFACTURER" && !value.barcode) {
    context.addIssue({ code: "custom", path: ["barcode"], message: "Enter or scan the manufacturer barcode." });
  }
});

export const productListSchema = z.object({
  search: z.string().trim().max(100).default(""),
  active: z.enum(["all", "true", "false"]).default("all"),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  productType: z.enum(productTypes).optional(),
  sort: z.enum(["nameAsc", "nameDesc", "skuAsc", "priceAsc", "priceDesc", "newest"]).default("nameAsc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const productVariantFields = z.object({
  code: z.string().trim().max(80).nullable().optional(),
  barcode: z.string().trim().max(100).nullable().optional(),
  barcodeType: z.enum(["INTERNAL", "MANUFACTURER"]).optional(),
  attributes: z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(100)),
});

export const productVariantInputSchema = productVariantFields.refine(
  (value) => Object.keys(value.attributes).length > 0,
  { message: "Add at least one variant attribute.", path: ["attributes"] },
);

export const productVariantUpdateSchema = productVariantFields.partial().extend({
  isActive: z.boolean().optional(),
}).superRefine((value, context) => {
  if (value.attributes && Object.keys(value.attributes).length === 0) {
    context.addIssue({ code: "custom", path: ["attributes"], message: "Add at least one variant attribute." });
  }
});

export const productUnitConversionSchema = z.object({
  unit: z.enum(measurementUnits),
  conversionFactor: z.string().trim().regex(/^\d{1,10}(?:\.\d{1,8})?$/).refine((value) => Number(value) > 0, "Conversion factor must be greater than zero."),
  isPurchaseUnit: z.boolean(),
  isSalesUnit: z.boolean(),
  precision: z.number().int().min(0).max(8),
  roundingMode: z.enum(roundingModes),
}).refine((value) => value.isPurchaseUnit || value.isSalesUnit, {
  message: "Select at least one usage for the unit.",
  path: ["isPurchaseUnit"],
});

export function parseCatalogList(searchParams: URLSearchParams) {
  return catalogListSchema.safeParse({
    search: searchParams.get("search") ?? "",
    active: searchParams.get("active") ?? "all",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "10",
  });
}

export function parseProductList(searchParams: URLSearchParams) {
  return productListSchema.safeParse({
    search: searchParams.get("search") ?? "",
    active: searchParams.get("active") ?? "all",
    categoryId: searchParams.get("categoryId") || undefined,
    brandId: searchParams.get("brandId") || undefined,
    productType: searchParams.get("productType") || undefined,
    sort: searchParams.get("sort") ?? "nameAsc",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "10",
  });
}

export async function readJsonBody(request: Request) {
  try {
    return { success: true as const, data: await request.json() };
  } catch (error) {
    if (error instanceof SyntaxError) return { success: false as const };
    throw error;
  }
}
