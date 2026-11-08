import { test } from "node:test";
import assert from "node:assert/strict";
import { subtotal, applyDiscount, roundCents } from "../src/cart.js";

test("subtotal adds every line", () => {
  assert.equal(
    subtotal([
      { price: 2, quantity: 3 },
      { price: 5, quantity: 1 },
    ]),
    11,
  );
});

test("applyDiscount takes a percentage off", () => {
  assert.equal(applyDiscount(200, 10), 180);
});

test("roundCents rounds to the nearest cent", () => {
  assert.equal(roundCents(1.006), 1.01);
  assert.equal(roundCents(2.349), 2.35);
});
