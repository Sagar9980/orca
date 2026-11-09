import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decideClaudeTool } from "../src/claudeCode.js";
import { FIXTURE } from "./helpers.js";

const at = (rel: string) => path.join(FIXTURE, rel);
const verdict = (name: string, input: unknown) => decideClaudeTool(FIXTURE, name, input).verdict;

describe("Claude Code gate", () => {
  it("allows reads inside the project and denies them outside", () => {
    expect(verdict("Read", { file_path: at("src/cart.js") })).toBe("allow");
    expect(verdict("Grep", { pattern: "x", path: at("src") })).toBe("allow");
    expect(verdict("Read", { file_path: "/etc/hosts" })).toBe("deny");
    expect(verdict("Read", { file_path: at("../../package.json") })).toBe("deny");
  });

  it("follows Orca's edit rules", () => {
    expect(verdict("Edit", { file_path: at("src/cart.js") })).toBe("allow");
    expect(verdict("Edit", { file_path: at("package.json") })).toBe("allow");
    expect(verdict("Write", { file_path: at("src/new.js") })).toBe("allow");
    expect(verdict("Read", { file_path: at(".env") })).toBe("ask");
  });

  it("runs ordinary commands, asks for installs and the internet, and denies dangerous commands and outside tools", () => {
    expect(verdict("Bash", { command: "npm test" })).toBe("allow");
    expect(verdict("Bash", { command: "npm install left-pad" })).toBe("ask");
    expect(verdict("Bash", { command: "git push origin main" })).toBe("deny");
    expect(verdict("WebFetch", { url: "https://example.com" })).toBe("ask");
    expect(verdict("mcp__github__create_issue", {})).toBe("deny");
    expect(verdict("SomethingNew", {})).toBe("ask");
  });

  it("denies a path that leaves the project through a symlink", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "orca-outside-"));
    const link = at("escape-link");
    fs.symlinkSync(outside, link);
    try {
      expect(verdict("Write", { file_path: path.join(link, "x.txt") })).toBe("deny");
    } finally {
      fs.rmSync(link);
      fs.rmSync(outside, { recursive: true });
    }
  });
});
