import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rounding = Prisma.Decimal.ROUND_HALF_UP;

const demoUnits = {
  KB_INTERIORS: {
    categories: ["Demo Plywood", "Demo Laminates", "Demo Hardware"],
    brands: ["Demo Century Surface", "Demo Green Surface", "Demo Hettich Hardware"],
    customer: "Demo Interiors Customer",
    supplier: "Demo Interiors Supplier",
    products: [
      { name: "Demo Plywood Panel 18mm", sku: "DEMO-KBI-PLY-18", category: "Demo Plywood", brand: "Demo Century Surface", baseUnit: "PCS", productType: "PANEL", purchasePrice: "1850", sellingPrice: "2450", gstPercentage: "18", minimumStock: "5", openingQuantity: "24" },
      { name: "Demo Matte Laminate Sheet", sku: "DEMO-KBI-LAM-01", category: "Demo Laminates", brand: "Demo Green Surface", baseUnit: "PCS", productType: "PANEL", purchasePrice: "680", sellingPrice: "950", gstPercentage: "18", minimumStock: "6", openingQuantity: "30" },
      { name: "Demo Soft-Close Hinge", sku: "DEMO-KBI-HNG-01", category: "Demo Hardware", brand: "Demo Hettich Hardware", baseUnit: "PCS", productType: "STANDARD", purchasePrice: "110", sellingPrice: "175", gstPercentage: "18", minimumStock: "10", openingQuantity: "40" },
    ],
  },
  KB_ELECTRICALS: {
    categories: ["Demo Cables", "Demo Lighting", "Demo Switchgear"],
    brands: ["Demo Polycab", "Demo Havells", "Demo Anchor"],
    customer: "Demo Electricals Customer",
    supplier: "Demo Electricals Supplier",
    products: [
      { name: "Demo Copper Cable Roll", sku: "DEMO-KBE-CAB-01", category: "Demo Cables", brand: "Demo Polycab", baseUnit: "ROLL", productType: "STANDARD", purchasePrice: "2100", sellingPrice: "2700", gstPercentage: "18", minimumStock: "3", openingQuantity: "18" },
      { name: "Demo LED Panel Light", sku: "DEMO-KBE-LGT-01", category: "Demo Lighting", brand: "Demo Havells", baseUnit: "PCS", productType: "STANDARD", purchasePrice: "420", sellingPrice: "650", gstPercentage: "12", minimumStock: "8", openingQuantity: "24" },
      { name: "Demo Modular Switch", sku: "DEMO-KBE-SWG-01", category: "Demo Switchgear", brand: "Demo Anchor", baseUnit: "PCS", productType: "STANDARD", purchasePrice: "55", sellingPrice: "90", gstPercentage: "18", minimumStock: "20", openingQuantity: "40" },
    ],
  },
  KB_KITCHEN_BATH: {
    categories: ["Demo Faucets", "Demo Sinks", "Demo Storage"],
    brands: ["Demo Jaquar", "Demo Cera", "Demo Ebco"],
    customer: "Demo Kitchen & Bath Customer",
    supplier: "Demo Kitchen & Bath Supplier",
    products: [
      { name: "Demo Pull-Down Faucet", sku: "DEMO-KBK-FCT-01", category: "Demo Faucets", brand: "Demo Jaquar", baseUnit: "PCS", productType: "STANDARD", purchasePrice: "1900", sellingPrice: "2650", gstPercentage: "18", minimumStock: "4", openingQuantity: "18" },
      { name: "Demo Stainless Sink Set", sku: "DEMO-KBK-SNK-01", category: "Demo Sinks", brand: "Demo Cera", baseUnit: "SET", productType: "STANDARD", purchasePrice: "2200", sellingPrice: "3200", gstPercentage: "18", minimumStock: "3", openingQuantity: "12" },
      { name: "Demo Pull-Out Basket", sku: "DEMO-KBK-STO-01", category: "Demo Storage", brand: "Demo Ebco", baseUnit: "PCS", productType: "STANDARD", purchasePrice: "1250", sellingPrice: "1800", gstPercentage: "18", minimumStock: "4", openingQuantity: "12" },
    ],
  },
  KB_TOOLS: {
    categories: ["Demo Power Tools", "Demo Hand Tools", "Demo Measuring Tools"],
    brands: ["Demo Bosch", "Demo Stanley", "Demo Taparia"],
    customer: "Demo Tools Customer",
    supplier: "Demo Tools Supplier",
    products: [
      { name: "Demo Cordless Drill", sku: "DEMO-KBT-DRL-01", category: "Demo Power Tools", brand: "Demo Bosch", baseUnit: "PCS", productType: "STANDARD", purchasePrice: "3200", sellingPrice: "4500", gstPercentage: "18", minimumStock: "4", openingQuantity: "12" },
      { name: "Demo Screwdriver Set", sku: "DEMO-KBT-SDR-01", category: "Demo Hand Tools", brand: "Demo Taparia", baseUnit: "SET", productType: "STANDARD", purchasePrice: "420", sellingPrice: "690", gstPercentage: "18", minimumStock: "8", openingQuantity: "24" },
      { name: "Demo Measuring Tape", sku: "DEMO-KBT-MSR-01", category: "Demo Measuring Tools", brand: "Demo Stanley", baseUnit: "PCS", productType: "STANDARD", purchasePrice: "90", sellingPrice: "150", gstPercentage: "18", minimumStock: "12", openingQuantity: "24" },
    ],
  },
  KB_TECH: {
    categories: ["Demo Computers", "Demo Networking", "Demo Peripherals"],
    brands: ["Demo Lenovo", "Demo TP-Link", "Demo Logitech"],
    customer: "Demo Tech Customer",
    supplier: "Demo Tech Supplier",
    products: [
      { name: "Demo Business Laptop", sku: "DEMO-KBTECH-LTP-01", category: "Demo Computers", brand: "Demo Lenovo", baseUnit: "PCS", productType: "STANDARD", purchasePrice: "42000", sellingPrice: "54000", gstPercentage: "18", minimumStock: "2", openingQuantity: "10" },
      { name: "Demo Wi-Fi Router", sku: "DEMO-KBTECH-RTR-01", category: "Demo Networking", brand: "Demo TP-Link", baseUnit: "PCS", productType: "STANDARD", purchasePrice: "2100", sellingPrice: "3200", gstPercentage: "18", minimumStock: "5", openingQuantity: "15" },
      { name: "Demo Wireless Keyboard", sku: "DEMO-KBTECH-KBD-01", category: "Demo Peripherals", brand: "Demo Logitech", baseUnit: "PCS", productType: "STANDARD", purchasePrice: "850", sellingPrice: "1299", gstPercentage: "18", minimumStock: "5", openingQuantity: "20" },
    ],
  },
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
