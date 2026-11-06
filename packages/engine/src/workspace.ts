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
  const worktree = path.join(os.tmpdir(), "orca-worktrees", `${path.basename(repo)}-${runId}`);
  await git(repo, "worktree", "add", "-q", "-b", branch, worktree, base);
  return { repo, branch, base, worktree, root: path.join(worktree, path.relative(repo, realProject)), dirty };
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
