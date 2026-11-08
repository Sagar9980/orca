import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceTotal } from "../src/invoice.js";

test("an empty invoice is zero", () => {
  assert.equal(invoiceTotal([]), "$0.00");
});

test("invoiceTotal adds up prices in cents", () => {
  assert.equal(
    invoiceTotal([
      { price: 19.99, quantity: 3 },
      { price: 1200, quantity: 1 },
    ]),
    "$1,259.97",
  );
});
