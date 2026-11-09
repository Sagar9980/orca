import { test } from "node:test";
import assert from "node:assert/strict";
import { titleCase, wordCount } from "../src/text.js";

test("wordCount counts words", () => {
  assert.equal(wordCount("one two three"), 3);
});

test("titleCase capitalizes every word", () => {
  assert.equal(titleCase("hello big world"), "Hello Big World");
});
