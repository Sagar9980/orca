import { test } from "node:test";
import assert from "node:assert/strict";
import { userNames } from "../src/users.js";

test("userNames keeps the order of the ids", async () => {
  assert.deepEqual(await userNames([3, 1, 2]), ["Linus", "Ada", "Grace"]);
});

test("userNames fails for an unknown user", async () => {
  await assert.rejects(userNames([1, 99]), /No user 99/);
});
