import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/slug.js";

test("slugify replaces every run of symbols", () => {
  assert.equal(slugify("Hello, World! Again"), "hello-world-again");
});
