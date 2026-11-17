import type { BranchChanges } from "@orca/shared";
import fs from "node:fs/promises";
import { git, gitRemote } from "./workspace.js";

// What the user does with a finished run's branch: look at it, merge it, push it for a pull request, or throw it
// away. Only orca/run-* branches are ever touched, so none of these can reach the user's own branches by mistake.

const RUN_BRANCH = /^orca\/run-[A-Za-z0-9_-]{1,64}$/;

async function repoOf(project: string, branch: string, into?: string): Promise<string> {
  if (!RUN_BRANCH.test(branch)) throw new Error(`${branch} isn't an Orca branch.`);
  if (into !== undefined && (!into || into.startsWith("-"))) throw new Error(`Invalid branch: ${into}`);
  const repo = await git(await fs.realpath(project), "rev-parse", "--show-toplevel");
  if (!(await git(repo, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).catch(() => ""))) {
    throw new Error(`Branch ${branch} is gone.`);
  }
  return repo;
}

export async function branchChanges(project: string, branch: string, into: string): Promise<BranchChanges> {
  const repo = await repoOf(project, branch, into);
  let from = await git(repo, "merge-base", "--end-of-options", into, branch);
  // A run starts from the remote's newer commits when the local branch is behind (see `latest` in workspace.ts).
  // Those are a teammate's work, not the run's, so the review starts after them.
  const upstream = await git(repo, "rev-parse", "--abbrev-ref", "--symbolic-full-name", `${into}@{upstream}`).catch(
    () => "",
  );
  const remoteFrom = upstream ? await git(repo, "merge-base", upstream, branch).catch(() => "") : "";
  if (
    remoteFrom &&
    (await git(repo, "merge-base", "--is-ancestor", from, remoteFrom).then(
      () => true,
      () => false,
    ))
  )
    from = remoteFrom;
  const log = await git(repo, "log", "--reverse", "--format=%h%x09%s", `${from}..${branch}`);
  const numstat = await git(repo, "diff", "--numstat", "-z", from, branch);
  // -z: "added\tremoved\tpath\0" per file ("-" for binary files); renames are skipped for simplicity.
  const files = numstat
    .split("\0")
    .filter((entry) => /^(\d+|-)\t(\d+|-)\t./.test(entry))
    .map((entry) => {
      const [added, removed, ...rest] = entry.split("\t");
      return { path: rest.join("\t"), added: Number(added) || 0, removed: Number(removed) || 0 };
    });
  const patch = await git(repo, "diff", from, branch);
  return {
    commits: log
      ? log.split("\n").map((line) => {
          const [sha, ...subject] = line.split("\t");
          return { sha: sha!, subject: subject.join("\t") };
        })
      : [],
    files,
    patch: patch.length > 400_000 ? `${patch.slice(0, 400_000)}\n… (cut off)` : patch,
  };
}

/**
 * Merges the run's branch into `into` and deletes it. Where `into` is checked out the merge happens there, so it
 * needs a folder without uncommitted changes to tracked files; anywhere else only a fast-forward is safe.
 */
export async function mergeBranch(project: string, branch: string, into: string): Promise<string> {
  const repo = await repoOf(project, branch, into);
  const current = await git(repo, "symbolic-ref", "--short", "-q", "HEAD").catch(() => "");
  if (current === into) {
    if (await git(repo, "status", "--porcelain", "--untracked-files=no")) {
      throw new Error(`Commit or stash your changes on ${into} first, then merge.`);
    }
    try {
      await git(repo, "merge", "-q", "--no-edit", branch);
    } catch (err) {
      // Unmerged paths mean a conflict; git reports those on stdout, so ask the index instead.
      const conflict = (await git(repo, "ls-files", "-u").catch(() => "")) !== "";
      await git(repo, "merge", "--abort").catch(() => {});
      throw new Error(
        conflict ? `${branch} conflicts with ${into}. Push it and open a PR instead.` : (err as Error).message,
      );
    }
  } else {
    // `fetch . a:b` moves b only by fast-forward, and refuses a branch checked out in another worktree.
    await git(repo, "fetch", "-q", ".", `${branch}:${into}`).catch(() => {
      throw new Error(`Switch your folder to ${into} to merge; ${branch} can't simply fast-forward it.`);
    });
  }
  await git(repo, "branch", "-q", "-D", branch);
  return `Merged into ${into}.`;
}

/** Pushes the run's branch and returns where to open a pull request for it, when the host is one we know. */
export async function pushBranch(
  project: string,
  branch: string,
  into: string,
): Promise<{ note: string; url?: string }> {
  const repo = await repoOf(project, branch, into);
  const remotes = (await git(repo, "remote")).split("\n").filter(Boolean);
  const remote = remotes.includes("origin") ? "origin" : remotes[0];
  if (!remote) throw new Error("This repo has no remote to push to.");
  await gitRemote(repo, "push", "-q", "-u", remote, `${branch}:refs/heads/${branch}`);
  const url = pullRequestUrl(await git(repo, "remote", "get-url", remote), branch, into);
  return { note: `Pushed to ${remote}.`, ...(url ? { url } : {}) };
}

export async function discardBranch(project: string, branch: string): Promise<string> {
  const repo = await repoOf(project, branch);
  await git(repo, "branch", "-q", "-D", branch);
  return "Discarded.";
}

/** The page that opens a pull request on GitHub, or a merge request on GitLab. */
export function pullRequestUrl(remoteUrl: string, branch: string, into: string): string | undefined {
  const m = remoteUrl.match(
    /^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/git@|git@)(github\.com|gitlab\.com)[:/](.+?)(?:\.git)?\/?$/,
  );
  if (!m) return undefined;
  const [, host, path] = m;
  const q = encodeURIComponent;
  // GitHub wants the slashes in branch names as they are.
  return host === "github.com"
    ? `https://github.com/${path}/compare/${encodeURI(into)}...${encodeURI(branch)}?expand=1`
    : `https://gitlab.com/${path}/-/merge_requests/new?merge_request[source_branch]=${q(branch)}&merge_request[target_branch]=${q(into)}`;
}
