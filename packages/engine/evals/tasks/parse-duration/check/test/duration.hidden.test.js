import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration } from "../src/duration.js";

test("parseDuration reads every unit alone and together", () => {
  assert.equal(parseDuration("2h"), 7200);
  assert.equal(parseDuration("15m"), 900);
  assert.equal(parseDuration("0s"), 0);
  assert.equal(parseDuration("1h 5m 10s"), 3910);
  assert.equal(parseDuration("2h10s"), 7210);
});

test("parseDuration rejects what the spec doesn't allow", () => {
  for (const text of ["", "   ", "10", "5d", "1m1h", "1h1h", "h", "abc", "1.5h"]) {
    assert.throws(() => parseDuration(text), RangeError, JSON.stringify(text));
  }
});
