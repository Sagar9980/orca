import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only the engine's own tests: fixtures/ holds test projects whose tests are meant to fail.
    include: ["test/**/*.test.ts"],
    // Tests make git repos and run shell commands, so give them more than the default 5 seconds.
    testTimeout: 20_000,
  },
});
