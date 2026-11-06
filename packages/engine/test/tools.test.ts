import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { runTool } from "../src/tools.js";
import { testRepo } from "./helpers.js";

let root: string;
beforeAll(async () => {
  root = await testRepo();
});

const run = (name: string, input: unknown) => runTool(root, name, input);

describe("paths stay inside the project", () => {
  it.each(["../outside.txt", "/etc/passwd", "src/../../x"])("refuses %s", async (p) => {
    const result = await run("read_file", { path: p });
    expect(result.isError).toBe(true);
  });

  it("refuses a symlink that points outside", async () => {
    await fs.symlink(os.tmpdir(), path.join(root, "escape"));
    expect((await run("read_file", { path: "escape/anything" })).isError).toBe(true);
    expect((await run("edit_file", { path: "escape/new.txt", old_string: "", new_string: "x" })).isError).toBe(true);
  });

  it("allows a name that only starts with two dots", async () => {
    await fs.writeFile(path.join(root, "..notes"), "hi");
    expect(await run("read_file", { path: "..notes" })).toMatchObject({ isError: false, content: "hi" });
  });
});

describe("tools", () => {
  it("lists files without .git", async () => {
    const { content } = await run("list_files", { path: "." });
    expect(content).toContain("src/cart.js");
    expect(content).not.toContain(".git/");
  });

  it("searches with a regular expression", async () => {
    const { content } = await run("search", { pattern: "applyDiscount", path: "src" });
    expect(content).toMatch(/src\/cart\.js:\d+:/);
  });

  it("edits one exact match, and creates new files only when they don't exist", async () => {
    await run("edit_file", { path: "new.txt", old_string: "", new_string: "one two" });
    expect((await run("edit_file", { path: "new.txt", old_string: "", new_string: "again" })).isError).toBe(true);
    await run("edit_file", { path: "new.txt", old_string: "two", new_string: "three" });
    expect(await fs.readFile(path.join(root, "new.txt"), "utf8")).toBe("one three");
    expect((await run("edit_file", { path: "new.txt", old_string: "missing", new_string: "x" })).isError).toBe(true);
  });

  it("rejects input that doesn't match the schema", async () => {
    expect((await run("read_file", { file: "x" })).isError).toBe(true);
  });
});

describe("run_command", () => {
  it("returns output and the exit code", async () => {
    expect((await run("run_command", { command: "echo hi; exit 3" })).content).toBe("hi\n\n[exit code 3]");
  });

  it("returns right away when the command leaves something running, and stops it", async () => {
    const started = Date.now();
    const { content } = await run("run_command", { command: "sleep 30 & echo started" });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(content).toContain("started");
  });

  it("doesn't pass the API key or other secrets to commands", async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    try {
      const { content } = await run("run_command", { command: "env" });
      expect(content).not.toContain("sk-test-not-real");
      expect(content).not.toContain("ANTHROPIC");
    } finally {
      if (before === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = before;
    }
  });
});
