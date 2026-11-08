import { test } from "node:test";
import assert from "node:assert/strict";
import { toCelsius, toFahrenheit } from "../src/temperature.js";

test("toFahrenheit", () => {
  assert.equal(toFahrenheit(0), 32);
  assert.equal(toFahrenheit(100), 212);
});

test("toCelsius", () => {
  assert.equal(toCelsius(212), 100);
});
