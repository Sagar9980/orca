import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { branchChanges, discardBranch, mergeBranch, pullRequestUrl, pushBranch } from "../src/review.js";
import { closeWorkspace, openFolder, openWorkspace } from "../src/workspace.js";
import { git, testRepo } from "./helpers.js";

// A remote (a bare repo), the user's clone of it, and a teammate's clone that pushes new work.
let dir: string;
let remote: string;
let user: string;
let teammate: string;
let main: string;
let n = 0;
const runId = () => `rv${++n}`;
const as = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"];

async function commitFile(cwd: string, file: string, text: string, message = `change ${file}`) {
  await fs.writeFile(path.join(cwd, file), text);
  git(cwd, "add", "-A");
  git(cwd, ...as, "commit", "-qm", message);
}

/** A run that changed one file and committed it to its branch. */
async function finishedRun(file = "run.txt") {
  const ws = await openWorkspace(user, runId());
  await commitFile(ws.root, file, "from the run\n", "Add run file");
  await closeWorkspace(ws, "task");
  return ws.branch;
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "orca-review-"));
  remote = path.join(dir, "remote.git");
  user = path.join(dir, "user");
  teammate = path.join(dir, "teammate");
  git(dir, "clone", "-q", "--bare", await testRepo(), remote);
  git(dir, "clone", "-q", remote, user);
  git(dir, "clone", "-q", remote, teammate);
  main = git(user, "branch", "--show-current");
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("before a run", () => {
  it("starts a worktree from the remote's new commits, without moving the user's branch", async () => {
    const before = git(user, "rev-parse", "HEAD");
    await commitFile(teammate, "new.txt", "new\n");
    git(teammate, "push", "-q");

    const ws = await openWorkspace(user, runId());
    expect(ws.synced).toMatch(/^Pulled 1 new commit from origin\//);
    expect(await fs.readFile(path.join(ws.root, "new.txt"), "utf8")).toBe("new\n");
    expect(git(user, "rev-parse", "HEAD")).toBe(before);
    await closeWorkspace(ws, "nothing");
  });

  it("keeps the user's own commits when both sides moved", async () => {
    await commitFile(teammate, "theirs.txt", "x\n");
    git(teammate, "push", "-q");
    await commitFile(user, "mine.txt", "y\n");

    const ws = await openWorkspace(user, runId());
    expect(ws.synced).toContain("have both moved");
    expect(ws.base).toBe(git(user, "rev-parse", "HEAD"));
    await closeWorkspace(ws, "nothing");
  });

  it("says so and goes on when the remote can't be reached", async () => {
    git(user, "remote", "set-url", "origin", path.join(dir, "gone.git"));
    const ws = await openWorkspace(user, runId());
    expect(ws.synced).toMatch(/Couldn't reach origin/);
    await closeWorkspace(ws, "nothing");
  });

  it("fast-forwards a clean folder for a live run, but never one with uncommitted work", async () => {
    await commitFile(teammate, "new.txt", "new\n");
    git(teammate, "push", "-q");

    await fs.appendFile(path.join(user, "package.json"), " ");
    const dirty = await openFolder(user);
    expect(dirty.synced).toMatch(/not pulled/);
    expect(await fs.stat(path.join(user, "new.txt")).catch(() => null)).toBeNull();

    git(user, "checkout", "-q", "--", "package.json");
    const clean = await openFolder(user);
    expect(clean.synced).toMatch(/^Pulled 1 new commit/);
    expect(await fs.readFile(path.join(user, "new.txt"), "utf8")).toBe("new\n");
  });
});

describe("before a live run", () => {
  it("doesn't pull over the user's ignored files", async () => {
    await commitFile(teammate, "local.cfg", "theirs\n");
    git(teammate, "push", "-q");
    await fs.appendFile(path.join(user, ".git/info/exclude"), "local.cfg\n");
    await fs.writeFile(path.join(user, "local.cfg"), "mine\n");
    const head = git(user, "rev-parse", "HEAD");

    const ws = await openFolder(user);
    expect(ws.synced).toMatch(/would overwrite files in your folder/);
    expect(await fs.readFile(path.join(user, "local.cfg"), "utf8")).toBe("mine\n");
    expect(git(user, "rev-parse", "HEAD")).toBe(head);
  });
});

describe("after a run", () => {
  it("shows the branch's commits and files", async () => {
    const branch = await finishedRun();
    const changes = await branchChanges(user, branch, main);
    expect(changes.commits.map((c) => c.subject)).toEqual(["Add run file"]);
    expect(changes.files).toEqual([{ path: "run.txt", added: 1, removed: 0 }]);
    expect(changes.patch).toContain("+from the run");
  });

  it("leaves out commits pulled from the remote, which aren't the run's work", async () => {
    await commitFile(teammate, "new.txt", "new\n", "Teammate's work");
    git(teammate, "push", "-q");
    const branch = await finishedRun();
    const changes = await branchChanges(user, branch, main);
    expect(changes.commits.map((c) => c.subject)).toEqual(["Add run file"]);
    expect(changes.files.map((f) => f.path)).toEqual(["run.txt"]);
  });

  it("merges into the checked-out branch and deletes the run's branch", async () => {
    const branch = await finishedRun();
    expect(await mergeBranch(user, branch, main)).toBe(`Merged into ${main}.`);
    expect(await fs.readFile(path.join(user, "run.txt"), "utf8")).toBe("from the run\n");
    expect(git(user, "branch", "--list", branch)).toBe("");
  });

  it("fast-forwards a branch that isn't checked out", async () => {
    const branch = await finishedRun();
    git(user, "checkout", "-q", "-b", "elsewhere");
    await mergeBranch(user, branch, main);
    expect(git(user, "show", `${main}:run.txt`)).toBe("from the run");
  });

  it("refuses to merge over uncommitted work, and backs out of a conflict", async () => {
    const branch = await finishedRun("package.json");
    await fs.appendFile(path.join(user, "package.json"), " ");
    await expect(mergeBranch(user, branch, main)).rejects.toThrow(/Commit or stash/);

    git(user, "checkout", "-q", "--", "package.json");
    await commitFile(user, "package.json", "{}\n");
    await expect(mergeBranch(user, branch, main)).rejects.toThrow(/conflicts with/);
    expect(git(user, "status", "--porcelain")).toBe("");
    expect(git(user, "branch", "--list", branch)).not.toBe("");
  });

  it("pushes the run's branch to the remote", async () => {
    const branch = await finishedRun();
    expect((await pushBranch(user, branch, main)).note).toBe("Pushed to origin.");
    expect(git(remote, "rev-parse", branch)).toBe(git(user, "rev-parse", branch));
  });

  it("discards only Orca's own branches", async () => {
    const branch = await finishedRun();
    await discardBranch(user, branch);
    expect(git(user, "branch", "--list", branch)).toBe("");
    await expect(discardBranch(user, main)).rejects.toThrow(/isn't an Orca branch/);
    await expect(mergeBranch(user, "orca/run-x", "--force")).rejects.toThrow(/Invalid branch/);
  });

  it("links to a new pull request on GitHub and GitLab", () => {
    expect(pullRequestUrl("git@github.com:me/app.git", "orca/run-1", "main")).toBe(
      "https://github.com/me/app/compare/main...orca/run-1?expand=1",
    );
    expect(pullRequestUrl("https://github.com/me/app", "orca/run-1", "main")).toBe(
      "https://github.com/me/app/compare/main...orca/run-1?expand=1",
    );
    expect(pullRequestUrl("https://gitlab.com/g/app.git", "orca/run-1", "main")).toContain(
      "gitlab.com/g/app/-/merge_requests/new?merge_request[source_branch]=orca%2Frun-1",
    );
    expect(pullRequestUrl("/some/path.git", "orca/run-1", "main")).toBeUndefined();
  });
});
