import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

// Each run works in its own git worktree on a new branch made from the last commit, so the user's checkout and
// uncommitted work are never touched. At the end the changes are committed to that branch for the user to review.

const exec = promisify(execFile);

/** Commits by the engine: no hooks from the user's repo, no signing prompts, and a clear author. */
const ORCA_COMMIT = ["-c", "user.name=Orca", "-c", "user.email=orca@localhost", "-c", "commit.gpgsign=false"];

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd });
  return stdout.trim();
}

export interface Workspace {
  /** The user's repository. */
  repo: string;
  branch: string;
  /** The commit the branch started from. The run changed something if the branch has moved past it. */
  base: string;
  worktree: string;
  /** Where the agent works: the worktree, or the same subfolder in it when the project is part of a bigger repo. */
  root: string;
  /** The repo had uncommitted changes. They stay where they are and aren't part of the run. */
  dirty: boolean;
  /** Ignored files brought over from the repo so the project builds and runs: installed packages and .env files. */
  copied: string[];
  /** Working live in the user's own folder on its current branch: no worktree, no new branch, nothing committed. */
  inPlace: boolean;
}

/**
 * Folders that projects keep out of git but need in order to run: installed packages, and `dist`, the built output
 * that packages in a monorepo import from each other. Only ones git ignores are copied.
 */
const DEPENDENCY_DIRS = new Set(["node_modules", ".venv", "venv", "vendor", "dist"]);
/** Local settings files such as .env and .env.local. Reading them needs a yes (see policy.ts). */
const ENV_FILE = /^\.env(\..+)?$/;

/**
 * Brings the repo's installed packages and .env files into the worktree, since a fresh checkout has neither and a
 * real project can't build or run its tests without them. On macOS each is a copy-on-write clone: instant, nearly no
 * disk, and changes in the run never reach the user's own copy. Elsewhere folders are symlinked.
 */
async function bringIgnoredFiles(repo: string, worktree: string): Promise<string[]> {
  const listed = await git(repo, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z");
  const wanted = listed
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ rel: entry.replace(/\/$/, ""), isDir: entry.endsWith("/") }))
    .filter(({ rel, isDir }) => (isDir ? DEPENDENCY_DIRS.has(path.basename(rel)) : ENV_FILE.test(path.basename(rel))));
  const copied: string[] = [];
  for (const { rel, isDir } of wanted) {
    const from = path.join(repo, rel);
    const to = path.join(worktree, rel);
    try {
      await fs.mkdir(path.dirname(to), { recursive: true });
      if (process.platform === "darwin") await exec("cp", ["-cR", from, to]);
      else if (isDir) await fs.symlink(from, to, process.platform === "win32" ? "junction" : "dir");
      else await fs.copyFile(from, to);
      copied.push(rel);
    } catch {
      // A missing or unreadable entry only means the agent installs it itself if it needs it.
    }
  }
  return copied;
}

/** `from` is the branch or commit to start from; the repo's current HEAD when left out. */
export async function openWorkspace(project: string, runId: string, from?: string): Promise<Workspace> {
  // The run id becomes part of a branch name and a folder name.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) throw new Error(`Invalid run id: ${runId}`);
  if (from !== undefined && (from === "" || from.startsWith("-"))) throw new Error(`Invalid branch: ${from}`);
  const realProject = await fs.realpath(project);
  const repo = await git(realProject, "rev-parse", "--show-toplevel").catch(() => {
    throw new Error(`${project} is not in a git repository. Orca works on a branch, so run \`git init\` first.`);
  });
  const base = await git(repo, "rev-parse", "--verify", "--end-of-options", `${from ?? "HEAD"}^{commit}`).catch(() => {
    throw new Error(
      from ? `Branch ${from} doesn't exist in ${repo}.` : `${repo} has no commits yet. Commit once so Orca can branch.`,
    );
  });

  const dirty = (await git(repo, "status", "--porcelain")) !== "";
  const branch = `orca/run-${runId}`;
  // The run already ran once (e.g. before the app kept runs across restarts). Its branch holds that work, so it is
  // never reused or reset; the user starts a new run instead.
  const taken = await git(repo, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).catch(() => "");
  if (taken) {
    throw new Error(`This run already ran before, and its work is on branch ${branch}. Start a new run to try again.`);
  }
  const worktree = path.join(os.tmpdir(), "orca-worktrees", `${path.basename(repo)}-${runId}`);
  await git(repo, "worktree", "add", "-q", "-b", branch, worktree, base);
  const copied = await bringIgnoredFiles(repo, worktree);
  const root = path.join(worktree, path.relative(repo, realProject));
  return { repo, branch, base, worktree, root, dirty, copied, inPlace: false };
}

/**
 * Works live in the user's own folder on the branch it is on, like an agent in a terminal: the user sees changes as
 * they happen and reviews them before committing. Nothing is copied, branched or committed. `from` must be the
 * folder's current branch, so the run never switches the user's checkout.
 */
export async function openFolder(project: string, from?: string): Promise<Workspace> {
  const realProject = await fs.realpath(project);
  const repo = await git(realProject, "rev-parse", "--show-toplevel").catch(() => {
    throw new Error(`${project} is not in a git repository. Run \`git init\` first.`);
  });
  const branch = await git(repo, "symbolic-ref", "--short", "-q", "HEAD").catch(() => "");
  if (from && branch !== from) {
    throw new Error(
      `Your folder is on ${branch || "a detached commit"}, not ${from}. Switch to ${from} first, or run in a worktree.`,
    );
  }
  const base = await git(repo, "rev-parse", "HEAD").catch(() => "");
  const dirty = (await git(repo, "status", "--porcelain")) !== "";
  return { repo, branch, base, worktree: repo, root: realProject, dirty, copied: [], inPlace: true };
}

/**
 * Commits whatever the agent changed to the run's branch and removes the worktree; the branch stays for review.
 * A run that changed nothing leaves no branch behind. `committed` is true when the branch holds any commits past
 * its base: Orca's commit here, or ones the agent made itself with `git commit`.
 */
export async function closeWorkspace(ws: Workspace, message: string): Promise<{ committed: boolean }> {
  await git(ws.worktree, "add", "-A");
  if ((await git(ws.worktree, "status", "--porcelain")) !== "") {
    await git(ws.worktree, ...ORCA_COMMIT, "commit", "-q", "--no-verify", "-m", message);
  }
  // --force only drops ignored files such as node_modules; everything tracked is committed above.
  await git(ws.repo, "worktree", "remove", "--force", ws.worktree);
  const ahead = Number(await git(ws.repo, "rev-list", "--count", `${ws.base}..${ws.branch}`));
  if (!ahead) await git(ws.repo, "branch", "-D", ws.branch);
  return { committed: ahead > 0 };
}

/** Copies a test project to a temporary folder and makes it a git repo with one commit, so it runs like a real one. */
export async function fixtureRepo(source: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orca-fixture-"));
  await fs.cp(source, dir, { recursive: true, filter: (p) => !p.includes(`${path.sep}node_modules`) });
  await git(dir, "init", "-q");
  await git(dir, "add", "-A");
  await git(dir, ...ORCA_COMMIT, "commit", "-q", "--no-verify", "-m", "Test project");
  return dir;
}
