import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

/** Same shape as FolderInfo in @orca/shared (this CommonJS package can't import it). */
export interface FolderInfo {
  path: string;
  name: string;
  isGit: boolean;
  branch: string | null;
  branches: string[];
  githubRepo: string | null;
}

function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    // execFile, not exec: the path is never parsed by a shell.
    execFile("git", ["-C", cwd, ...args], { timeout: 5000 }, (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

/** "git@github.com:me/app.git" or "https://github.com/me/app" → "me/app". */
export function githubRepoFromRemote(url: string | null): string | null {
  const m = url?.match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export async function inspectFolder(folder: string): Promise<FolderInfo> {
  const name = path.basename(folder);
  const top = await git(folder, ["rev-parse", "--show-toplevel"]);
  // Only a folder that is the root of its repo counts; a subfolder of some other repo doesn't.
  if (!top || (await realpath(top).catch(() => top)) !== (await realpath(folder).catch(() => folder))) {
    return { path: folder, name, isGit: false, branch: null, branches: [], githubRepo: null };
  }
  const [branch, list, remote] = await Promise.all([
    git(folder, ["symbolic-ref", "--short", "-q", "HEAD"]),
    git(folder, ["branch", "--format=%(refname:short)"]),
    git(folder, ["remote", "get-url", "origin"]),
  ]);
  const branches = list ? list.split("\n").filter(Boolean) : [];
  return {
    path: folder,
    name,
    isGit: true,
    branch: branch || null,
    branches: branch && !branches.includes(branch) ? [branch, ...branches] : branches,
    githubRepo: githubRepoFromRemote(remote),
  };
}

/** Turns a folder into a git repo on a "main" branch. */
export async function initRepo(folder: string): Promise<boolean> {
  return (await git(folder, ["init", "-b", "main"])) !== null;
}
