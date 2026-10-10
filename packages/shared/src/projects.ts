// Projects: the codebases Orca's agents work in. Shared by the server's
// projects API, the web app and the desktop app's folder bridge.

import type { RunStatus } from "./model.js";

export type ProjectSource = "local" | "github";

/** Spend limits the composer offers for a new run. */
export const RUN_BUDGET_CHOICES_USD = [5, 20, 50, 100] as const;
export const DEFAULT_RUN_BUDGET_USD = 20;

export interface RunSummary {
  id: string;
  projectId: string;
  /** What the user asked for, in their own words. */
  title: string;
  status: RunStatus;
  /** Branch the run starts from. */
  branch: string;
  budgetUsd: number;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface Project {
  id: string;
  /** Unique per user; used in URLs (/p/:slug). */
  slug: string;
  name: string;
  source: ProjectSource;
  defaultBranch: string;
  /** "owner/repo" when the project is on GitHub. */
  githubRepo: string | null;
  /** Where the project sits on the computer making the request, if it's there. */
  folder: string | null;
  createdAt: string;
  lastOpenedAt: string | null;
  /** Newest first. */
  runs: RunSummary[];
}

/** The desktop app install a request comes from. */
export interface DeviceInfo {
  /** Random id the desktop app keeps in its own storage. */
  id: string;
  /** Computer name, e.g. "Sagar's MacBook Pro". */
  name: string;
  platform: string;
}

export interface CreateLocalProjectInput {
  source: "local";
  name: string;
  /** Absolute path on the device. */
  path: string;
  defaultBranch: string;
  githubRepo?: string | null;
  device: DeviceInfo;
}

export interface CreateRunInput {
  title: string;
  branch: string;
  budgetUsd: number;
}

/** What the desktop app reports about a folder the user picked. */
export interface FolderInfo {
  path: string;
  /** The folder's own name, used as the default project name. */
  name: string;
  isGit: boolean;
  /** Checked-out branch, or null when it isn't a git repo (or HEAD is detached). */
  branch: string | null;
  branches: string[];
  /** "owner/repo" when origin points at GitHub. */
  githubRepo: string | null;
}

/** Header the web app sends from the desktop app so the server can return that device's folders. */
export const DEVICE_HEADER = "x-orca-device";
