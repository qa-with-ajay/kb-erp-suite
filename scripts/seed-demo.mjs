import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rounding = Prisma.Decimal.ROUND_HALF_UP;

function buildProducts(
  prefix,
  categoryBrandMap,
  basePrice
) {
  return Array.from({ length: 20 }, (_, index) => {
    const item = categoryBrandMap[index % categoryBrandMap.length];
    const seq = String(index + 1).padStart(3, "0");

    const purchasePrice = basePrice + index * 100;
    const sellingPrice = Math.round(purchasePrice * 1.35);

    return {
      name: `${prefix} Product ${seq}`,
      sku: `${prefix}-${seq}`,
      category: item.category,
      brand: item.brand,
      baseUnit: "PCS",
      productType: "STANDARD",
      purchasePrice: purchasePrice.toString(),
      sellingPrice: sellingPrice.toString(),
      gstPercentage: "18",
      minimumStock: "5",
      openingQuantity: String(20 + (index % 10) * 5),
    };
  });
}
const KB_INTERIORS = {
  categories: [
    "Demo Plywood",
    "Demo Laminates",
    "Demo Hardware",
    "Demo Edge Band",
    "Demo Adhesives",
  ],

  brands: [
    "Demo Century",
    "Demo Greenlam",
    "Demo Hettich",
    "Demo Merino",
    "Demo Fevicol",
  ],

  customer: "Demo Interiors Customer",
  supplier: "Demo Interiors Supplier",

  products: buildProducts(
    "DEMO-KBI",
    [
      { category: "Demo Plywood", brand: "Demo Century" },
      { category: "Demo Laminates", brand: "Demo Greenlam" },
      { category: "Demo Hardware", brand: "Demo Hettich" },
      { category: "Demo Edge Band", brand: "Demo Merino" },
      { category: "Demo Adhesives", brand: "Demo Fevicol" },
    ],
    500
  ),
};
const KB_ELECTRICALS = {
  categories: [
    "Demo Cables",
    "Demo Lighting",
    "Demo Switchgear",
    "Demo Conduit",
    "Demo Distribution",
  ],

  brands: [
    "Demo Polycab",
    "Demo Havells",
    "Demo Anchor",
    "Demo Finolex",
    "Demo L&T",
  ],

  customer: "Demo Electricals Customer",
  supplier: "Demo Electricals Supplier",

  products: buildProducts(
    "DEMO-KBE",
    [
      { category: "Demo Cables", brand: "Demo Polycab" },
      { category: "Demo Lighting", brand: "Demo Havells" },
      { category: "Demo Switchgear", brand: "Demo Anchor" },
      { category: "Demo Conduit", brand: "Demo Finolex" },
      { category: "Demo Distribution", brand: "Demo L&T" },
    ],
    300
  ),
};
const KB_KITCHEN_BATH = {
  categories: [
    "Demo Faucets",
    "Demo Sinks",
    "Demo Storage",
    "Demo Accessories",
    "Demo Shower Systems",
  ],

  brands: [
    "Demo Jaquar",
    "Demo Cera",
    "Demo Ebco",
    "Demo Kohler",
    "Demo Hindware",
  ],

  customer: "Demo Kitchen Customer",
  supplier: "Demo Kitchen Supplier",

  products: buildProducts(
    "DEMO-KBK",
    [
      { category: "Demo Faucets", brand: "Demo Jaquar" },
      { category: "Demo Sinks", brand: "Demo Cera" },
      { category: "Demo Storage", brand: "Demo Ebco" },
      { category: "Demo Accessories", brand: "Demo Kohler" },
      { category: "Demo Shower Systems", brand: "Demo Hindware" },
    ],
    800
  ),
};
const KB_TOOLS = {
  categories: [
    "Demo Power Tools",
    "Demo Hand Tools",
    "Demo Measuring Tools",
    "Demo Cutting Tools",
    "Demo Workshop Tools",
  ],

  brands: [
    "Demo Bosch",
    "Demo Stanley",
    "Demo Taparia",
    "Demo Dewalt",
    "Demo Makita",
  ],

  customer: "Demo Tools Customer",
  supplier: "Demo Tools Supplier",

  products: buildProducts(
    "DEMO-KBT",
    [
      { category: "Demo Power Tools", brand: "Demo Bosch" },
      { category: "Demo Hand Tools", brand: "Demo Stanley" },
      { category: "Demo Measuring Tools", brand: "Demo Taparia" },
      { category: "Demo Cutting Tools", brand: "Demo Dewalt" },
      { category: "Demo Workshop Tools", brand: "Demo Makita" },
    ],
    600
  ),
};
const KB_TECH = {
  categories: [
    "Demo Computers",
    "Demo Networking",
    "Demo Peripherals",
    "Demo Storage",
    "Demo Security",
  ],

  brands: [
    "Demo Lenovo",
    "Demo TPLink",
    "Demo Logitech",
    "Demo WD",
    "Demo Hikvision",
  ],

  customer: "Demo Tech Customer",
  supplier: "Demo Tech Supplier",

  products: buildProducts(
    "DEMO-KBTCH",
    [
      { category: "Demo Computers", brand: "Demo Lenovo" },
      { category: "Demo Networking", brand: "Demo TPLink" },
      { category: "Demo Peripherals", brand: "Demo Logitech" },
      { category: "Demo Storage", brand: "Demo WD" },
      { category: "Demo Security", brand: "Demo Hikvision" },
    ],
    2500
  ),
};
const KB_FURNITURE = {
  categories: [
    "Demo Sofas",
    "Demo Dining",
    "Demo Bedroom",
    "Demo Living Room",
    "Demo Office Furniture",
  ],

  brands: [
    "Demo WoodenCraft",
    "Demo ComfortPlus",
    "Demo HomeStyle",
    "Demo UrbanLiving",
    "Demo OfficePro",
  ],

  customer: "Demo Furniture Customer",
  supplier: "Demo Furniture Supplier",

  products: buildProducts(
    "DEMO-KBFUR",
    [
      { category: "Demo Sofas", brand: "Demo ComfortPlus" },
      { category: "Demo Dining", brand: "Demo WoodenCraft" },
      { category: "Demo Bedroom", brand: "Demo HomeStyle" },
      { category: "Demo Living Room", brand: "Demo UrbanLiving" },
      { category: "Demo Office Furniture", brand: "Demo OfficePro" },
    ],
    5000
  ),
};


const demoUnits = {
  KB_INTERIORS,
  KB_ELECTRICALS,
  KB_KITCHEN_BATH,
  KB_TOOLS,
  KB_TECH,
  KB_FURNITURE,
};

function demoUuid(key) {
  const hex = createHash("sha256").update(`kb-interiors-demo:${key}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function calculateAmounts(quantity, unitPrice, gstPercentage) {
  const subtotal = new Prisma.Decimal(quantity).mul(unitPrice).toDecimalPlaces(2, rounding);
  const tax = subtotal.mul(gstPercentage).div(100).toDecimalPlaces(2, rounding);
  return { subtotal, tax, total: subtotal.plus(tax) };
}

function nextAverageCost(oldQuantity, oldCost, addedQuantity, addedCost) {
  const nextQuantity = oldQuantity.plus(addedQuantity);
  return nextQuantity.greaterThan(0)
    ? oldQuantity.mul(oldCost).plus(addedQuantity.mul(addedCost)).div(nextQuantity)
      .toDecimalPlaces(4, rounding)
    : addedCost;
}

async function seedOpeningStock(tx, businessUnit, actorId, location, product, data) {
  const idempotencyKey = `kb-demo:opening:${data.sku}`;
  const existingMovement = await tx.stockMovement.findUnique({
    where: { businessUnitId_idempotencyKey: { businessUnitId: businessUnit.id, idempotencyKey } },
    select: { id: true },
  });
  if (existingMovement) return;

  const balanceWhere = {
    businessUnitId: businessUnit.id,
    locationId: location.id,
    productId: product.id,
    variantId: null,
    stockKind: "STANDARD",
  };
  const balance = await tx.stockBalance.findFirst({ where: balanceWhere });
  const quantity = new Prisma.Decimal(data.openingQuantity);
  const unitCost = product.purchasePrice;
  const oldQuantity = balance?.quantity ?? new Prisma.Decimal(0);
  const oldAverageCost = balance?.averageCost ?? new Prisma.Decimal(0);
  const newQuantity = oldQuantity.plus(quantity);
  const averageCost = nextAverageCost(oldQuantity, oldAverageCost, quantity, unitCost);

  const movement = await tx.stockMovement.create({
    data: {
      businessUnitId: businessUnit.id,
      type: "OPENING",
      actorId,
      destinationLocationId: location.id,
      reference: `DEMO-OPENING-${businessUnit.code}`,
      idempotencyKey,
      reason: "Sample data opening balance",
    },
  });
  await tx.stockLedgerEntry.create({
    data: {
      businessUnitId: businessUnit.id,
      movementId: movement.id,
      productId: product.id,
      locationId: location.id,
      stockKind: "STANDARD",
      quantityDelta: quantity,
      unitCost,
    },
  });
  if (balance) {
    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantity: newQuantity, averageCost },
    });
  } else {
    await tx.stockBalance.create({ data: { ...balanceWhere, quantity: newQuantity, averageCost } });
  }
  await tx.auditLog.create({
    data: {
      userId: actorId,
      businessUnitId: businessUnit.id,
      action: "CREATE",
      entity: "StockMovement",
      entityId: movement.id,
      details: { type: "OPENING", productId: product.id, locationId: location.id, quantity: quantity.toString(), demo: true },
    },
  });
}

async function seedPurchase(tx, businessUnit, actorId, location, supplier, product) {
  const orderKey = `kb-demo:purchase-order:${businessUnit.code}`;
  const orderNumber = `DEMO-${businessUnit.code}-PO-001`;
  const purchaseQuantity = new Prisma.Decimal(10);
  const purchaseUnitCost = product.purchasePrice;
  const amounts = calculateAmounts(purchaseQuantity, purchaseUnitCost, product.gstPercentage);
  const order = await tx.purchaseOrder.upsert({
    where: { businessUnitId_idempotencyKey: { businessUnitId: businessUnit.id, idempotencyKey: orderKey } },
    update: {},
    create: {
      businessUnitId: businessUnit.id,
      supplierId: supplier.id,
      orderNumber,
      idempotencyKey: orderKey,
      taxMode: "GST",
      notes: "Sample data generated by the demo seed script.",
      subtotal: amounts.subtotal,
      taxAmount: amounts.tax,
      total: amounts.total,
      createdBy: actorId,
      lines: {
        create: [{
          lineNumber: 1,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          baseUnit: product.baseUnit,
          purchaseQuantity,
          purchaseUnit: product.baseUnit,
          conversionFactor: 1,
          conversionPrecision: 4,
          roundingMode: "HALF_UP",
          quantity: purchaseQuantity,
          unitCost: purchaseUnitCost,
          purchaseUnitCost,
          gstPercentage: product.gstPercentage,
          lineSubtotal: amounts.subtotal,
          lineTax: amounts.tax,
          lineTotal: amounts.total,
        }],
      },
    },
    include: { lines: true },
  });
  const orderLine = order.lines.find((line) => line.lineNumber === 1);
  if (!orderLine) throw new Error(`Demo purchase order ${orderNumber} has no line.`);

  const receiptKey = `kb-demo:purchase-receipt:${businessUnit.code}`;
  const existingMovement = await tx.stockMovement.findUnique({
    where: { businessUnitId_idempotencyKey: { businessUnitId: businessUnit.id, idempotencyKey: receiptKey } },
    select: { id: true },
  });
  if (existingMovement || orderLine.receivedPurchaseQuantity.greaterThan(0)) return;

  const supplierInvoiceNumber = `DEMO-${businessUnit.code}-INV-001`;
  const existingReceipt = await tx.purchaseReceipt.findUnique({
    where: {
      businessUnitId_supplierId_supplierInvoiceNumber: {
        businessUnitId: businessUnit.id,
        supplierId: supplier.id,
        supplierInvoiceNumber,
      },
    },
    select: { id: true },
  });
  if (existingReceipt) return;

  const receiptAmounts = calculateAmounts(
    orderLine.purchaseQuantity,
    orderLine.purchaseUnitCost,
    orderLine.gstPercentage,
  );
  const movement = await tx.stockMovement.create({
    data: {
      businessUnitId: businessUnit.id,
      type: "PURCHASE_IN",
      actorId,
      destinationLocationId: location.id,
      reference: supplierInvoiceNumber,
      idempotencyKey: receiptKey,
      reason: `Sample receipt for ${order.orderNumber}`,
    },
  });
  const receipt = await tx.purchaseReceipt.create({
    data: {
      businessUnitId: businessUnit.id,
      stockMovementId: movement.id,
      purchaseOrderId: order.id,
      supplierId: supplier.id,
      locationId: location.id,
      supplierInvoiceNumber,
      taxMode: order.taxMode,
      subtotal: receiptAmounts.subtotal,
      taxAmount: receiptAmounts.tax,
      total: receiptAmounts.total,
      receivedBy: actorId,
    },
  });

  const balanceWhere = {
    businessUnitId: businessUnit.id,
    locationId: location.id,
    productId: orderLine.productId,
    variantId: null,
    stockKind: "STANDARD",
  };
  const balance = await tx.stockBalance.findFirst({ where: balanceWhere });
  if (!balance) throw new Error(`Opening stock is missing for demo product ${product.sku}.`);
  const newQuantity = balance.quantity.plus(orderLine.quantity);
  const averageCost = nextAverageCost(
    balance.quantity,
    balance.averageCost,
    orderLine.quantity,
    orderLine.unitCost,
  );
  await tx.stockLedgerEntry.create({
    data: {
      businessUnitId: businessUnit.id,
      movementId: movement.id,
      productId: orderLine.productId,
      locationId: location.id,
      stockKind: "STANDARD",
      quantityDelta: orderLine.quantity,
      unitCost: orderLine.unitCost,
    },
  });
  await tx.stockBalance.update({
    where: { id: balance.id },
    data: { quantity: newQuantity, averageCost },
  });
  await tx.purchaseReceiptLine.create({
    data: {
      businessUnitId: businessUnit.id,
      purchaseReceiptId: receipt.id,
      purchaseOrderLineId: orderLine.id,
      lineNumber: 1,
      productId: orderLine.productId,
      productName: orderLine.productName,
      sku: orderLine.sku,
      baseUnit: orderLine.baseUnit,
      purchaseQuantity: orderLine.purchaseQuantity,
      purchaseUnit: orderLine.purchaseUnit,
      conversionFactor: orderLine.conversionFactor,
      conversionPrecision: orderLine.conversionPrecision,
      roundingMode: orderLine.roundingMode,
      quantity: orderLine.quantity,
      unitCost: orderLine.unitCost,
      purchaseUnitCost: orderLine.purchaseUnitCost,
      gstPercentage: orderLine.gstPercentage,
      lineSubtotal: receiptAmounts.subtotal,
      lineTax: receiptAmounts.tax,
      lineTotal: receiptAmounts.total,
    },
  });
  await tx.purchaseOrderLine.update({
    where: { id: orderLine.id },
    data: {
      receivedPurchaseQuantity: orderLine.purchaseQuantity,
      receivedQuantity: orderLine.quantity,
    },
  });
  await tx.purchaseOrder.update({
    where: { id: order.id },
    data: { status: "RECEIVED" },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId,
      businessUnitId: businessUnit.id,
      action: "CREATE",
      entity: "PurchaseReceipt",
      entityId: receipt.id,
      details: { orderNumber, supplierInvoiceNumber, total: receiptAmounts.total.toString(), demo: true },
    },
  });
}

async function seedSale(tx, businessUnit, actorId, location, customer, product) {
  const idempotencyKey = `kb-demo:sale:${businessUnit.code}`;
  const existingMovement = await tx.stockMovement.findUnique({
    where: { businessUnitId_idempotencyKey: { businessUnitId: businessUnit.id, idempotencyKey } },
    select: { id: true },
  });
  if (existingMovement) return;

  const invoiceNumber = `DEMO-${businessUnit.code}-INV-001`;
  const existingSale = await tx.sale.findUnique({
    where: { businessUnitId_invoiceNumber: { businessUnitId: businessUnit.id, invoiceNumber } },
    select: { id: true },
  });
  if (existingSale) throw new Error(`Invoice number ${invoiceNumber} is already in use.`);

  const balance = await tx.stockBalance.findFirst({
    where: {
      businessUnitId: businessUnit.id,
      locationId: location.id,
      productId: product.id,
      variantId: null,
      stockKind: "STANDARD",
    },
  });
  const quantity = new Prisma.Decimal(2);
  if (!balance || balance.quantity.lessThan(quantity)) {
    throw new Error(`Insufficient demo stock to create a sale for ${product.sku}.`);
  }
  const amounts = calculateAmounts(quantity, product.sellingPrice, product.gstPercentage);
  const lineCost = balance.averageCost.mul(quantity).toDecimalPlaces(2, rounding);
  const movement = await tx.stockMovement.create({
    data: {
      businessUnitId: businessUnit.id,
      type: "SALE",
      actorId,
      sourceLocationId: location.id,
      reference: invoiceNumber,
      idempotencyKey,
      reason: "Sample invoice sale",
    },
  });
  const sale = await tx.sale.create({
    data: {
      businessUnitId: businessUnit.id,
      stockMovementId: movement.id,
      customerId: customer.id,
      invoiceNumber,
      taxMode: "GST",
      customerName: customer.name,
      customerPhone: customer.phone,
      subtotal: amounts.subtotal,
      taxAmount: amounts.tax,
      total: amounts.total,
      costOfGoods: lineCost,
      createdBy: actorId,
    },
  });
  await tx.stockLedgerEntry.create({
    data: {
      businessUnitId: businessUnit.id,
      movementId: movement.id,
      productId: product.id,
      locationId: location.id,
      stockKind: "STANDARD",
      quantityDelta: quantity.negated(),
      unitCost: balance.averageCost,
    },
  });
  await tx.stockBalance.update({
    where: { id: balance.id },
    data: { quantity: balance.quantity.minus(quantity) },
  });
  await tx.saleLine.create({
    data: {
      businessUnitId: businessUnit.id,
      saleId: sale.id,
      lineNumber: 1,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      baseUnit: product.baseUnit,
      quantity,
      unitPrice: product.sellingPrice,
      gstPercentage: product.gstPercentage,
      lineSubtotal: amounts.subtotal,
      lineTax: amounts.tax,
      lineTotal: amounts.total,
      unitCost: balance.averageCost,
      lineCost,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actorId,
      businessUnitId: businessUnit.id,
      action: "CREATE",
      entity: "Sale",
      entityId: sale.id,
      details: { invoiceNumber, lineCount: 1, total: amounts.total.toString(), demo: true },
    },
  });
}

async function seedBusinessUnit(tx, businessUnit, actorId, data) {
  if (!businessUnit.profile) throw new Error(`Business profile is missing for ${businessUnit.code}.`);

  const categories = new Map();
  for (const name of data.categories) {
    const category = await tx.category.upsert({
      where: { businessUnitId_name: { businessUnitId: businessUnit.id, name } },
      update: { description: "Sample category created by the demo seed script.", isActive: true },
      create: {
        businessUnitId: businessUnit.id,
        name,
        description: "Sample category created by the demo seed script.",
      },
    });
    categories.set(name, category);
  }

  const brands = new Map();
  for (const name of data.brands) {
    const brand = await tx.brand.upsert({
      where: { businessUnitId_name: { businessUnitId: businessUnit.id, name } },
      update: { isActive: true },
      create: { businessUnitId: businessUnit.id, name },
    });
    brands.set(name, brand);
  }

  const customerId = demoUuid(`${businessUnit.code}:customer`);
  const customerData = {
    name: data.customer,
    phone: "9000000001",
    email: `customer.${businessUnit.code.toLowerCase()}@example.com`,
    addressLine1: "Demo Market Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
    isActive: true,
  };
  const customer = await tx.customer.upsert({
    where: { id: customerId },
    update: customerData,
    create: { id: customerId, businessUnitId: businessUnit.id, ...customerData },
  });

  const supplierId = demoUuid(`${businessUnit.code}:supplier`);
  const supplierData = {
    name: data.supplier,
    phone: "9000000002",
    email: `supplier.${businessUnit.code.toLowerCase()}@example.com`,
    addressLine1: "Demo Industrial Estate",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560002",
    isActive: true,
  };
  const supplier = await tx.supplier.upsert({
    where: { id: supplierId },
    update: supplierData,
    create: { id: supplierId, businessUnitId: businessUnit.id, ...supplierData },
  });

  const location = await tx.stockLocation.upsert({
    where: { businessUnitId_code: { businessUnitId: businessUnit.id, code: "DEMO_MAIN" } },
    update: { name: "Demo Main Store", isActive: true },
    create: { businessUnitId: businessUnit.id, name: "Demo Main Store", code: "DEMO_MAIN" },
  });

  const products = [];
  for (const item of data.products) {
    const product = await tx.product.upsert({
      where: { businessUnitId_sku: { businessUnitId: businessUnit.id, sku: item.sku } },
      update: {
        name: item.name,
        description: "Sample product created by the demo seed script.",
        productType: item.productType,
        baseUnit: item.baseUnit,
        purchasePrice: item.purchasePrice,
        sellingPrice: item.sellingPrice,
        gstPercentage: item.gstPercentage,
        minimumStock: item.minimumStock,
        categoryId: categories.get(item.category).id,
        brandId: brands.get(item.brand).id,
        isActive: true,
      },
      create: {
        businessUnitId: businessUnit.id,
        name: item.name,
        sku: item.sku,
        description: "Sample product created by the demo seed script.",
        productType: item.productType,
        baseUnit: item.baseUnit,
        purchasePrice: item.purchasePrice,
        sellingPrice: item.sellingPrice,
        gstPercentage: item.gstPercentage,
        minimumStock: item.minimumStock,
        categoryId: categories.get(item.category).id,
        brandId: brands.get(item.brand).id,
      },
    });
    products.push({ record: product, config: item });
  }

  for (const { record, config } of products) {
    await seedOpeningStock(tx, businessUnit, actorId, location, record, config);
  }
  await seedPurchase(tx, businessUnit, actorId, location, supplier, products[0].record);
  await seedSale(tx, businessUnit, actorId, location, customer, products[0].record);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seeding is disabled in production.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Check the local .env file.");
  }

  const codes = Object.keys(demoUnits);
  const [businessUnits, actor] = await Promise.all([
    prisma.businessUnit.findMany({
      where: { code: { in: codes } },
      include: { profile: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);
  const foundCodes = new Set(businessUnits.map(({ code }) => code));
  const missingCodes = codes.filter((code) => !foundCodes.has(code));
  if (missingCodes.length) {
    throw new Error(`Run database migrations first; missing business units: ${missingCodes.join(", ")}.`);
  }
  if (!actor) throw new Error("Create an active administrator account before seeding demo data.");

  for (const unit of businessUnits) {
    await prisma.$transaction(
      (tx) => seedBusinessUnit(tx, unit, actor.id, demoUnits[unit.code]),
      { timeout: 60000 },
    );
    console.log(`Demo data ready for ${unit.name}.`);
  }
  console.log("Demo data is ready across all five business units. Re-running this command is safe.");
}

main()
  .catch((error) => {
    console.error("Unable to seed demo data:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
