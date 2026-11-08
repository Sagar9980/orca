import { test } from "node:test";
import assert from "node:assert/strict";
import { wordCount } from "../src/text.js";

test("wordCount handles any whitespace", () => {
  assert.equal(wordCount("  hello   world\n"), 2);
  assert.equal(wordCount("a\tb\nc"), 3);
  assert.equal(wordCount("one"), 1);
});

test("wordCount of blank text is zero", () => {
  assert.equal(wordCount(""), 0);
  assert.equal(wordCount(" \n\t "), 0);
});
