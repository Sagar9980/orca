import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents } from "../src/money.js";

test("toCents doesn't lose a cent to floating point", () => {
  assert.equal(toCents(0.29), 29);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(4.35), 435);
});
