import { app } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ClientCommand, RunEvent } from "@orca/shared" with { "resolution-mode": "import" };
import type { ClaudeLogin, RunHandle } from "@orca/engine" with { "resolution-mode": "import" };
import { apiKey } from "./apiKey";
import { isDirectory } from "./folders";

// Runs the agent engine in the main process, next to the project folders. The page only starts runs, sends
// commands and receives events; the API key never leaves this process (and run_command strips it too).

/** Runs started in this app session, by run id. Kept after they finish so a reopened page can replay them. */
const runs = new Map<string, RunHandle>();

/** Set ORCA_FAKE_MODEL=1 to try runs with scripted model replies, for free. */
const FAKE_MODEL = process.env.ORCA_FAKE_MODEL === "1";

// This package is CommonJS and the engine is ESM, so it is loaded with import().
const engine = () => import("@orca/engine");

/** In development the key can also come from packages/engine/.env, like the CLI; a key saved in Account wins. */
export function loadDevKey() {
  const file = path.join(__dirname, "../../../packages/engine/.env");
  if (!process.env.ANTHROPIC_API_KEY && existsSync(file)) process.loadEnvFile(file);
}

/**
 * Whether Claude Code on this computer is signed in, checked fresh each time since the user can sign in or out in a
 * terminal at any moment. Starts Claude Code without a prompt, so it costs nothing.
 */
export async function claudeLogin(): Promise<ClaudeLogin> {
  return (await engine()).checkClaudeLogin();
}

interface StartInput {
  runId: string;
  title: string;
  folder: string;
  branch: string;
  budgetUsd: number;
  /** false: work live in the folder on its current branch instead of in a worktree. */
  worktree: boolean;
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
    i.budgetUsd <= 100 &&
    (i.worktree === undefined || typeof i.worktree === "boolean");
  if (!ok) throw new Error("Invalid run.");
  return { ...(i as unknown as StartInput), worktree: i.worktree !== false };
}

/** The run's events so far, or none if it hasn't started in this app session. */
// Every run's events are also appended to a file in the app's data folder, so a run that finished before the app
// restarted still opens as it ended instead of offering to start again. They stay on this computer, like the code.
const runsDir = () => path.join(app.getPath("userData"), "runs");
const runFile = (runId: string) => path.join(runsDir(), `${runId}.jsonl`);

function saveEvent(event: RunEvent) {
  try {
    mkdirSync(runsDir(), { recursive: true });
    appendFileSync(runFile(event.runId), JSON.stringify(event) + "\n", { mode: 0o600 });
  } catch {
    // The run goes on; only reopening it after a restart would miss this event.
  }
}

/**
 * The events that end a run the app quit or crashed during: open questions are closed, agents stop, and the run is
 * marked failed with where its changes are. Without them the page would still offer approvals nobody can receive.
 */
function closeOut(events: RunEvent[], runId: string, lastSeq: number): RunEvent[] {
  let seq = lastSeq;
  const at = new Date().toISOString();
  const base = () => ({ runId, seq: ++seq, at });
  const answered = new Set(events.flatMap((e) => (e.type === "human.responded" ? [e.requestId] : [])));
  const summary = `Orca closed while this run was going. Any changes it made are on branch orca/run-${runId}.`;
  const out: RunEvent[] = [];
  for (const e of events) {
    if (e.type === "human.requested" && !answered.has(e.request.id))
      out.push({ type: "human.responded", ...base(), requestId: e.request.id, response: "no answer (Orca closed)" });
  }
  for (const e of events) {
    if (e.type === "subagent.spawned")
      out.push({
        type: "subagent.updated",
        ...base(),
        subAgentId: e.subAgent.id,
        patch: { state: "issue", activity: "Stopped", waitingOn: null },
      });
    if (e.type === "agent.spawned")
      out.push({ type: "agent.updated", ...base(), agentId: e.agent.id, patch: { status: "issue", summary } });
  }
  out.push({ type: "run.finished", ...base(), status: "failed", summary });
  return out;
}

/** A saved run. One that never finished (the app quit or crashed) is reported as stopped. */
function savedEvents(runId: string): RunEvent[] {
  let events: RunEvent[];
  try {
    events = readFileSync(runFile(runId), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RunEvent);
  } catch {
    return [];
  }
  const last = events[events.length - 1];
  if (last && last.type !== "run.finished") {
    const ending = closeOut(events, runId, last.seq);
    ending.forEach(saveEvent);
    events.push(...ending);
  }
  return events;
}

export function attachRun(runId: unknown): RunEvent[] {
  if (typeof runId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(runId)) return [];
  return runs.get(runId)?.events() ?? savedEvents(runId);
}

/** Starts a run unless it is already going; returns its events so far either way. */
export async function startRun(input: unknown, broadcast: (event: RunEvent) => void): Promise<RunEvent[]> {
  const { runId, title, folder, branch, budgetUsd, worktree } = parseStart(input);
  const existing = runs.get(runId);
  if (existing) return existing.events();
  // A run from before a restart is shown as it ended, never started a second time.
  const saved = savedEvents(runId);
  if (saved.length) return saved;
  if (!(await isDirectory(folder))) throw new Error("The project folder isn't on this computer.");
  // The user's own Claude Code login comes first; Orca's own loop on an API key is the fallback.
  const signedIn = !FAKE_MODEL && (await claudeLogin()).signedIn;
  const key = await apiKey();
  if (!FAKE_MODEL && !signedIn && !key) {
    throw new Error("Sign in to Claude Code (`claude auth login`) or add an Anthropic API key in Account settings.");
  }

  const { fakeClient, startRun } = await engine();
  const handle = startRun({
    runId,
    title,
    project: folder,
    branch,
    maxUsd: budgetUsd,
    worktree,
    ...(FAKE_MODEL
      ? { client: fakeClient() }
      : signedIn
        ? { runner: "claude-code" as const }
        : key
          ? { apiKey: key }
          : {}),
    onEvent: (event) => {
      saveEvent(event);
      broadcast(event);
    },
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
