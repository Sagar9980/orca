import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { closeWorkspace, openFolder, openWorkspace } from "../src/workspace.js";
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

  it("brings installed packages into the run, but not .env secrets or other ignored files", async () => {
    const dir = await testRepo();
    await fs.writeFile(path.join(dir, ".gitignore"), "node_modules/\n.env*\n!.env.example\nbuild/\n");
    await fs.writeFile(path.join(dir, ".env.example"), "TOKEN=\n");
    git(dir, "add", "-A");
    git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "ignore");
    await fs.mkdir(path.join(dir, "node_modules/left-pad"), { recursive: true });
    await fs.writeFile(path.join(dir, "node_modules/left-pad/index.js"), "module.exports = 1;\n");
    await fs.mkdir(path.join(dir, "src/nested/node_modules/dep"), { recursive: true });
    await fs.writeFile(path.join(dir, "src/nested/node_modules/dep/index.js"), "x\n");
    await fs.writeFile(path.join(dir, ".env"), "TOKEN=secret\n");
    await fs.writeFile(path.join(dir, ".env.local"), "TOKEN=local\n");
    await fs.mkdir(path.join(dir, "build"));
    await fs.writeFile(path.join(dir, "build/out.js"), "built\n");

    const ws = await openWorkspace(dir, runId());
    expect([...ws.copied].sort()).toEqual(["node_modules", "src/nested/node_modules"]);
    expect(await fs.readFile(path.join(ws.root, "node_modules/left-pad/index.js"), "utf8")).toContain("1");
    // Any command in the run could read a .env file, so secrets never come along.
    expect(await exists(path.join(ws.root, ".env"))).toBe(false);
    expect(await exists(path.join(ws.root, ".env.local"))).toBe(false);
    expect(await exists(path.join(ws.root, "build"))).toBe(false);

    // The run's packages are its own copy on every platform: changing them leaves the user's alone.
    expect((await fs.lstat(path.join(ws.root, "node_modules"))).isSymbolicLink()).toBe(false);
    await fs.writeFile(path.join(ws.root, "node_modules/left-pad/index.js"), "changed\n");
    expect(await fs.readFile(path.join(dir, "node_modules/left-pad/index.js"), "utf8")).toContain("1");
    // Ignored files never end up in the run's commit.
    await fs.writeFile(path.join(ws.root, "src/slug.js"), "export const changed = true;\n");
    await closeWorkspace(ws, "Orca: test");
    const files = git(dir, "ls-tree", "-r", "--name-only", ws.branch);
    expect(files).not.toContain("node_modules");
    expect(files).not.toMatch(/^\.env$/m);
  });

  it("refuses to start a run whose branch already exists, and leaves that branch alone", async () => {
    const id = runId();
    const first = await openWorkspace(repo, id);
    await fs.writeFile(path.join(first.root, "src/slug.js"), "export const first = true;\n");
    await closeWorkspace(first, "Orca: first");
    const before = git(repo, "rev-parse", first.branch);

    await expect(openWorkspace(repo, id)).rejects.toThrow(/already ran before.*orca\/run-/);
    expect(git(repo, "rev-parse", first.branch)).toBe(before);
  });

  it("works live in the folder on its current branch when there's no worktree", async () => {
    const dir = await testRepo();
    const current = git(dir, "branch", "--show-current");
    const ws = await openFolder(dir, current);
    expect(ws).toMatchObject({ inPlace: true, branch: current, copied: [] });
    expect(await fs.realpath(ws.root)).toBe(await fs.realpath(dir));

    await expect(openFolder(dir, "some-other-branch")).rejects.toThrow(/Your folder is on .*not some-other-branch/);
    expect(git(dir, "branch", "--list", "orca/*")).toBe("");
  });

  it("copies only what the run's branch ignores too, and never commits copied files", async () => {
    const dir = await testRepo();
    const commit = (msg: string) => git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", msg);
    // The branch the run starts from ignores node_modules but not .env; the user's checkout ignores both.
    await fs.writeFile(path.join(dir, ".gitignore"), "node_modules/\n");
    git(dir, "add", "-A");
    commit("ignore packages");
    git(dir, "branch", "base-without-env-rule");
    await fs.writeFile(path.join(dir, ".gitignore"), "node_modules/\n.env\n");
    git(dir, "add", "-A");
    commit("ignore .env too");
    await fs.mkdir(path.join(dir, "node_modules/pkg"), { recursive: true });
    await fs.writeFile(path.join(dir, "node_modules/pkg/index.js"), "x\n");
    await fs.writeFile(path.join(dir, ".env"), "TOKEN=secret\n");

    const ws = await openWorkspace(dir, runId(), "base-without-env-rule");
    expect(ws.copied).toEqual(["node_modules"]);
    expect(await exists(path.join(ws.root, ".env"))).toBe(false);

    // Even if the agent stops ignoring the packages, what was copied in stays out of the commit.
    await fs.writeFile(path.join(ws.root, ".gitignore"), "");
    await fs.writeFile(path.join(ws.root, "src/slug.js"), "export const changed = true;\n");
    expect(await closeWorkspace(ws, "Orca: test")).toEqual({ committed: true });
    const files = git(dir, "ls-tree", "-r", "--name-only", ws.branch);
    expect(files).not.toContain("node_modules");
    expect(files).toContain("src/slug.js");
  });
});
