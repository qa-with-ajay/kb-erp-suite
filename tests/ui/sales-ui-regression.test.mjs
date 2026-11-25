import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const salesPage = await readFile(new URL("../../app/sales/page.tsx", import.meta.url), "utf8");
const salesManager = await readFile(new URL("../../app/sales/sales-manager.tsx", import.meta.url), "utf8");

test("sales page keeps enterprise header and bounded content layout", () => {
  assert.match(salesPage, /data-testid="sales-page"/);
  assert.match(salesPage, /Sales & billing/);
  assert.match(salesPage, /max-w-\[1600px\]/);
  assert.match(salesPage, /BusinessUnitSwitcher/);
});

test("sales checkout preserves invoice, customer and payment controls", () => {
  assert.match(salesManager, /Create invoice/);
  assert.match(salesManager, /customerId/);
  assert.match(salesManager, /saveCustomerToMaster/);
  assert.match(salesManager, /Amount received/);
  assert.match(salesManager, /Payment method/);
  assert.match(salesManager, /Complete sale/);
});

test("sales checkout retains barcode, stock allocation and invoice history", () => {
  assert.match(salesManager, /BarcodeScanner/);
  assert.match(salesManager, /Stock source allocation/);
  assert.match(salesManager, /Create a remnant from opened package/);
  assert.match(salesManager, /Invoices/);
  assert.match(salesManager, /Previous/);
  assert.match(salesManager, /Next/);
});

test("sale submission retains confirmation and idempotency safeguards", () => {
  assert.match(salesManager, /Confirm sale/);
  assert.match(salesManager, /idempotencyKey/);
  assert.match(salesManager, /window\.location\.assign/);
});
