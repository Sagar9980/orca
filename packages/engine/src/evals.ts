import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { Command } from "@langchain/langgraph";
import type { Usage } from "./models.js";
import { runShell } from "./tools.js";
import { buildWorker, type ApprovalAnswer, type ApprovalRequest, type WorkerEvent } from "./worker.js";
import { fixtureRepo } from "./workspace.js";

// The eval set: small tasks with a known answer, run by the real worker, graded by a command the agent can't change.
// Each task folder in evals/tasks has:
//   task.json  the prompt, the check command, and the paths to put back before checking
//   project/   what the agent works on, copied to a throwaway git repo
//   check/     optional hidden files, such as extra tests, copied over the result before the check runs
//   solution/  a reference fix, used only by the engine's tests to prove the task can pass

const exec = promisify(execFile);

export const TASKS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../evals/tasks");

export interface EvalTask {
  name: string;
  dir: string;
  /** What the task measures, for people reading the results. */
  about: string;
  prompt: string;
  /** Shell command run in the project after the agent stops; exit code 0 means the task passed. */
  check: string;
  /** Paths put back as they were before the check, so editing the tests or package.json can't make it pass. */
  protect: string[];
}

export interface EvalResult {
  task: string;
  /** 1 for the first try at a task, 2 for the second with `--repeat 2`, and so on. */
  attempt: number;
  passed: boolean;
  /** Why the worker stopped: the model's stop reason, the limit it hit, or "error". */
  stop: string;
  turns: number;
  costUsd: number;
  usage: Usage;
  /** Calls the gate asked about, which the eval approved in place of a human. */
  approvals: number;
  seconds: number;
  /** The end of the check's output, to see why a task failed. */
  checkOutput: string;
  error?: string;
  /** Where the task's folder was left, with `keep`. */
  dir?: string;
}

export interface EvalOptions {
  model: string;
  maxUsd: number;
  maxTurns: number;
  client?: Anthropic;
  /** Every worker event, for the run's log. */
  onEvent?: (event: WorkerEvent) => void;
  /** Leave the task's folder in place for a look afterwards; it is deleted otherwise. */
  keep?: boolean;
}

/** Reads every task in `dir`, or only the ones named. */
export async function loadTasks(dir = TASKS_DIR, only: string[] = []): Promise<EvalTask[]> {
  const names = (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  const unknown = only.filter((n) => !names.includes(n));
  if (unknown.length) throw new Error(`Unknown eval task ${unknown.join(", ")}. Known: ${names.join(", ")}`);
  const tasks: EvalTask[] = [];
  for (const name of names.sort()) {
    if (only.length && !only.includes(name)) continue;
    const config = JSON.parse(await fs.readFile(path.join(dir, name, "task.json"), "utf8"));
    tasks.push({ name, dir: path.join(dir, name), protect: [], about: "", ...config });
  }
  return tasks;
}

/** Copies a task's project to a fresh git repo with one commit. */
export async function taskRepo(task: EvalTask): Promise<string> {
  return fixtureRepo(path.join(task.dir, "project"));
}

/**
 * Puts the protected paths back as they were committed, copies the hidden check files over, and runs the check.
 * Grading happens on what the agent left behind; whatever it committed or didn't commit doesn't matter.
 */
export async function grade(task: EvalTask, repo: string): Promise<{ passed: boolean; output: string }> {
  for (const p of task.protect) {
    await exec("git", ["checkout", "--quiet", "HEAD", "--", p], { cwd: repo });
  }
  const checkDir = path.join(task.dir, "check");
  if (await fs.stat(checkDir).catch(() => null)) await fs.cp(checkDir, repo, { recursive: true, force: true });
  const { ok, text } = await runShell(repo, task.check);
  return { passed: ok, output: text };
}

/**
 * Runs one task with no human: the gate still decides every call and denied commands stay denied, but calls it would
 * ask about are approved. The eval CLI asks the person once before starting, since commands run unattended.
 */
export async function runTask(task: EvalTask, attempt: number, options: EvalOptions): Promise<EvalResult> {
  const { model, maxUsd, maxTurns, client, onEvent, keep } = options;
  const started = Date.now();
  const repo = await taskRepo(task);
  // The commit the agent started from, since `grade` restores protected paths from HEAD and the agent may commit.
  const { stdout: base } = await exec("git", ["rev-parse", "HEAD"], { cwd: repo });
  const worker = buildWorker({ root: repo, model, maxUsd, maxTurns, ...(client ? { client } : {}) });
  const thread = { configurable: { thread_id: `${task.name}-${attempt}` } };

  let approvals = 0;
  let error: string | undefined;
  try {
    let input: Parameters<typeof worker.stream>[0] = { messages: [{ role: "user", content: task.prompt }] };
    while (true) {
      const stream = await worker.stream(input, { ...thread, streamMode: "custom", recursionLimit: maxTurns * 3 + 5 });
      for await (const event of stream) onEvent?.(event as WorkerEvent);
      const pending = (await worker.getState(thread)).tasks.flatMap((t) => t.interrupts);
      if (!pending.length) break;
      const { calls } = pending[0].value as ApprovalRequest;
      approvals += calls.length;
      input = new Command({ resume: Object.fromEntries(calls.map((c) => [c.id, true])) satisfies ApprovalAnswer });
    }
  } catch (err) {
    // A bad key fails every task the same way, so it stops the whole eval. Other API errors fail only this task.
    if (!(err instanceof Anthropic.APIError) || err instanceof Anthropic.AuthenticationError) {
      await fs.rm(repo, { recursive: true, force: true });
      throw err;
    }
    error = `API error ${err.status ?? ""}: ${err.message}`;
  }

  // The agent may have moved HEAD with its own commits; protected paths come back from where it started. An agent
  // that broke the repo itself (deleted .git, say) fails the task instead of stopping the whole eval.
  const { passed, output } = await exec("git", ["reset", "--quiet", "--soft", base.trim()], { cwd: repo })
    .then(() => grade(task, repo))
    .catch((err: Error) => ({ passed: false, output: `Couldn't grade: ${err.message}` }));
  const state = (await worker.getState(thread)).values;
  if (!keep) await fs.rm(repo, { recursive: true, force: true });

  return {
    task: task.name,
    attempt,
    passed: passed && !error,
    stop: error ? "error" : (state.limit ?? state.stopReason ?? "none"),
    turns: state.turns ?? 0,
    costUsd: state.spentUsd ?? 0,
    usage: state.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    approvals,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    checkOutput: output.slice(-2000),
    ...(error ? { error } : {}),
    ...(keep ? { dir: repo } : {}),
  };
}

export interface EvalSummary {
  runs: number;
  passed: number;
  passRate: number;
  totalUsd: number;
  meanUsd: number;
  meanTurns: number;
  /** What a finished task costs: everything spent, failures included, divided by the tasks that passed. */
  usdPerPass: number | null;
}

export function summarize(results: EvalResult[]): EvalSummary {
  const runs = results.length;
  const passed = results.filter((r) => r.passed).length;
  const totalUsd = results.reduce((sum, r) => sum + r.costUsd, 0);
  const turns = results.reduce((sum, r) => sum + r.turns, 0);
  return {
    runs,
    passed,
    passRate: runs ? passed / runs : 0,
    totalUsd,
    meanUsd: runs ? totalUsd / runs : 0,
    meanTurns: runs ? turns / runs : 0,
    usdPerPass: passed ? totalUsd / passed : null,
  };
}
