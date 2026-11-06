import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { closeWorkspace, openWorkspace } from "../src/workspace.js";
import { exists, git, testRepo } from "./helpers.js";

let repo: string;
let n = 0;
const runId = () => `t${++n}`;
const agentCommit = (cwd: string) =>
  git(cwd, "-c", "user.name=agent", "-c", "user.email=a@a", "commit", "-qam", "agent's own commit");

beforeAll(async () => {
  repo = await testRepo();
});

describe("workspace", () => {
  it("works on a new branch and leaves the user's checkout and uncommitted work alone", async () => {
    const cart = path.join(repo, "src/cart.js");
    const original = await fs.readFile(cart, "utf8");
    await fs.appendFile(cart, "// user's uncommitted work\n");
    try {
      const ws = await openWorkspace(repo, runId());
      expect(ws.dirty).toBe(true);
      expect(await fs.readFile(path.join(ws.root, "src/cart.js"), "utf8")).not.toContain("uncommitted");

      await fs.writeFile(path.join(ws.root, "src/slug.js"), "export const changed = true;\n");
      expect(await closeWorkspace(ws, "Orca: test")).toEqual({ committed: true });

      expect(await exists(ws.worktree)).toBe(false);
      expect(git(repo, "rev-list", "--count", `HEAD..${ws.branch}`)).toBe("1");
      expect(git(repo, "show", `${ws.branch}:src/slug.js`)).toContain("changed");
      expect(git(repo, "log", "-1", "--format=%an", ws.branch)).toBe("Orca");
      expect(git(repo, "branch", "--show-current")).not.toBe(ws.branch);
      expect(await fs.readFile(cart, "utf8")).toContain("uncommitted");
    } finally {
      await fs.writeFile(cart, original);
    }
  });

  it("leaves no branch when nothing changed", async () => {
    const ws = await openWorkspace(repo, runId());
    expect(await closeWorkspace(ws, "x")).toEqual({ committed: false });
    expect(git(repo, "branch", "--list", ws.branch)).toBe("");
  });

  it("keeps the branch when the agent made its own commits", async () => {
    const ws = await openWorkspace(repo, runId());
    await fs.writeFile(path.join(ws.root, "src/slug.js"), "// agent fix\n");
    agentCommit(ws.worktree);
    await fs.writeFile(path.join(ws.root, "src/cart.js"), "// left uncommitted\n");
    expect(await closeWorkspace(ws, "x")).toEqual({ committed: true });
    expect(git(repo, "rev-list", "--count", `HEAD..${ws.branch}`)).toBe("2");
  });

  it("maps a project in a subfolder into the worktree", async () => {
    const ws = await openWorkspace(path.join(repo, "src"), runId());
    expect(ws.root).toBe(path.join(ws.worktree, "src"));
    await closeWorkspace(ws, "x");
  });

  it("starts from the branch it is given", async () => {
    git(repo, "branch", "other");
    const ws = await openWorkspace(repo, runId(), "other");
    expect(ws.base).toBe(git(repo, "rev-parse", "other"));
    await closeWorkspace(ws, "x");
  });

  it("refuses bad input", async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), "orca-plain-"));
    try {
      await expect(openWorkspace(plain, runId())).rejects.toThrow(/not in a git repository/);
    } finally {
      await fs.rm(plain, { recursive: true, force: true });
    }
    await expect(openWorkspace(repo, "../escape")).rejects.toThrow(/Invalid run id/);
    await expect(openWorkspace(repo, runId(), "--output=x")).rejects.toThrow(/Invalid branch/);
    await expect(openWorkspace(repo, runId(), "no-such-branch")).rejects.toThrow(/doesn't exist/);
  });
});
