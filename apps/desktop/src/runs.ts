import { existsSync } from "node:fs";
import path from "node:path";
import type { ClientCommand, RunEvent } from "@orca/shared" with { "resolution-mode": "import" };
import type { RunHandle } from "@orca/engine" with { "resolution-mode": "import" };
import { isDirectory } from "./folders";

// Runs the agent engine in the main process, next to the project folders. The page only starts runs, sends
// commands and receives events; the API key never leaves this process (and run_command strips it too).

/** Runs started in this app session, by run id. Kept after they finish so a reopened page can replay them. */
const runs = new Map<string, RunHandle>();

/** Set ORCA_FAKE_MODEL=1 to try runs with scripted model replies, for free. */
const FAKE_MODEL = process.env.ORCA_FAKE_MODEL === "1";

// This package is CommonJS and the engine is ESM, so it is loaded with import().
const engine = () => import("@orca/engine");

/** In development the key comes from packages/engine/.env, like the CLI. A settings screen replaces this. */
export function loadDevKey() {
  const file = path.join(__dirname, "../../../packages/engine/.env");
  if (!process.env.ANTHROPIC_API_KEY && existsSync(file)) process.loadEnvFile(file);
}

interface StartInput {
  runId: string;
  title: string;
  folder: string;
  branch: string;
  budgetUsd: number;
}

function parseStart(input: unknown): StartInput {
  const i = (input ?? {}) as Record<string, unknown>;
  const ok =
    typeof i.runId === "string" &&
    /^[A-Za-z0-9_-]{1,64}$/.test(i.runId) &&
    typeof i.title === "string" &&
    i.title.trim().length > 0 &&
    i.title.length <= 4000 &&
    typeof i.folder === "string" &&
    path.isAbsolute(i.folder) &&
    typeof i.branch === "string" &&
    typeof i.budgetUsd === "number" &&
    Number.isFinite(i.budgetUsd) &&
    i.budgetUsd > 0 &&
    i.budgetUsd <= 100;
  if (!ok) throw new Error("Invalid run.");
  return i as unknown as StartInput;
}

/** The run's events so far, or none if it hasn't started in this app session. */
export function attachRun(runId: unknown): RunEvent[] {
  return typeof runId === "string" ? (runs.get(runId)?.events() ?? []) : [];
}

/** Starts a run unless it is already going; returns its events so far either way. */
export async function startRun(input: unknown, broadcast: (event: RunEvent) => void): Promise<RunEvent[]> {
  const { runId, title, folder, branch, budgetUsd } = parseStart(input);
  const existing = runs.get(runId);
  if (existing) return existing.events();
  if (!(await isDirectory(folder))) throw new Error("The project folder isn't on this computer.");
  if (!FAKE_MODEL && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("No Anthropic API key. In development, put ANTHROPIC_API_KEY in packages/engine/.env.");
  }

  const { fakeClient, startRun } = await engine();
  const handle = startRun({
    runId,
    title,
    project: folder,
    branch,
    maxUsd: budgetUsd,
    ...(FAKE_MODEL ? { client: fakeClient() } : {}),
    onEvent: broadcast,
  });
  runs.set(runId, handle);
  return handle.events();
}

export function commandRun(command: unknown) {
  const c = (command ?? {}) as Partial<ClientCommand>;
  if (c.type !== "run.pause" && c.type !== "run.resume" && c.type !== "human.respond") return;
  if (typeof c.runId !== "string") return;
  if (c.type === "human.respond" && (typeof c.requestId !== "string" || typeof c.response !== "string")) return;
  runs.get(c.runId)?.send(c as ClientCommand);
}

/**
 * On quit: end every run at its next safe point, so its changes get committed to its branch. Gives up after
 * `waitMs`, since a model call in flight can take a while; the worktree is then left for `git worktree prune`.
 */
export async function stopAllRuns(waitMs = 10_000) {
  for (const run of runs.values()) run.stop();
  const all = Promise.all([...runs.values()].map((run) => run.done));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, waitMs))]);
}
