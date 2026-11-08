import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL, modelInfo } from "./models.js";
import { loadTasks, runTask, summarize, type EvalResult, type EvalSummary } from "./evals.js";
import type { WorkerEvent } from "./worker.js";

// Runs the eval set and reports pass rate, cost and turns, so a change to the engine, a prompt or the model can be
// measured. Results go to evals/results/<time>-<model>/: summary.json plus one event log per task run.
// Usage: pnpm --filter @orca/engine eval [task ...] [--model claude-opus-5-5] [--budget 0.25] [--turns 30]
//          [--repeat 3] [--baseline evals/results/<run>] [--keep] [--yes]

const here = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(here, "../evals/results");

const argv = process.argv.slice(2).filter((arg, i) => !(i === 0 && arg === "--"));
const { positionals, values } = parseArgs({
  args: argv,
  allowPositionals: true,
  options: {
    model: { type: "string", default: DEFAULT_MODEL },
    budget: { type: "string", default: "0.25" },
    turns: { type: "string", default: "30" },
    repeat: { type: "string", default: "1" },
    baseline: { type: "string" },
    keep: { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
  },
});
const model = values.model;
const maxUsd = Number(values.budget);
const maxTurns = Number(values.turns);
const repeat = Number(values.repeat);

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
try {
  modelInfo(model);
} catch (err) {
  fail((err as Error).message);
}
if (!Number.isFinite(maxUsd) || maxUsd <= 0) fail(`--budget must be a positive number of US dollars per task.`);
if (!Number.isInteger(maxTurns) || maxTurns <= 0) fail(`--turns must be a positive whole number.`);
if (!Number.isInteger(repeat) || repeat <= 0) fail(`--repeat must be a positive whole number.`);
if (!process.env.ANTHROPIC_API_KEY) fail("Set ANTHROPIC_API_KEY in packages/engine/.env (see .env.example).");

const tasks = await loadTasks(undefined, positionals).catch((err: Error) => fail(err.message));
const baseline = values.baseline ? await readBaseline(values.baseline) : null;

console.log(`${tasks.length} tasks × ${repeat} on ${model}, up to $${maxUsd} and ${maxTurns} turns each.`);
console.log(`At most $${(tasks.length * repeat * maxUsd).toFixed(2)} in total.`);
// Nobody answers the gate during an eval, so the human approves once, up front.
if (!values.yes) {
  console.log(
    "\nThe agent's commands and new files are approved without asking, in throwaway copies of the tasks.\n" +
      "Denied commands stay denied. Commands still run on this computer.",
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const reply = await rl.question("Start? [y/N] ").catch(() => "");
  rl.close();
  if (!/^y(es)?$/i.test(reply.trim())) process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = path.join(RESULTS_DIR, `${stamp}-${model}`);
await fs.mkdir(out, { recursive: true });

const results: EvalResult[] = [];
for (const task of tasks) {
  for (let attempt = 1; attempt <= repeat; attempt++) {
    const label = repeat > 1 ? `${task.name} #${attempt}` : task.name;
    process.stdout.write(`\n${label.padEnd(24)} `);
    const log: WorkerEvent[] = [];
    const result = await runTask(task, attempt, {
      model,
      maxUsd,
      maxTurns,
      keep: values.keep,
      onEvent: (event) => {
        log.push(event);
        if (event.kind === "turn") process.stdout.write(".");
      },
    }).catch((err) =>
      err instanceof Anthropic.AuthenticationError
        ? fail("\n\nThe API key was rejected. Check packages/engine/.env.")
        : Promise.reject(err),
    );
    results.push(result);
    await fs.writeFile(
      path.join(out, `${task.name}-${attempt}.jsonl`),
      log.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    const mark = result.passed ? "✓ pass" : "✗ FAIL";
    process.stdout.write(
      ` ${mark}  ${result.turns} turns  $${result.costUsd.toFixed(4)}  ${result.seconds}s  (${result.stop})`,
    );
    if (result.error) process.stdout.write(`\n  ${result.error}`);
    if (result.dir) process.stdout.write(`\n  Kept in ${result.dir}`);
  }
}

const summary = summarize(results);
const saved = { model, maxUsd, maxTurns, repeat, startedAt: stamp, engine: engineVersion(), summary, results };
await fs.writeFile(path.join(out, "summary.json"), JSON.stringify(saved, null, 2) + "\n");

console.log(`\n\n${describe(summary)}`);
if (baseline) compare(baseline, summary, results);
console.log(`\nResults and event logs: ${path.relative(process.cwd(), out)}`);

function describe(s: EvalSummary): string {
  return [
    `Passed ${s.passed}/${s.runs} (${(s.passRate * 100).toFixed(0)}%)`,
    `$${s.totalUsd.toFixed(4)} total, $${s.meanUsd.toFixed(4)} per task`,
    `${s.usdPerPass === null ? "no passes" : `$${s.usdPerPass.toFixed(4)} per passed task`}`,
    `${s.meanTurns.toFixed(1)} turns per task`,
  ].join(" · ");
}

interface Saved {
  model: string;
  engine: string;
  summary: EvalSummary;
  results: EvalResult[];
}

/** Takes a results folder or its summary.json. */
async function readBaseline(p: string): Promise<Saved> {
  const file = p.endsWith(".json") ? p : path.join(p, "summary.json");
  return JSON.parse(await fs.readFile(file, "utf8"));
}

/** Prints the baseline's numbers and every task whose pass rate changed. */
function compare(base: Saved, now: EvalSummary, results: EvalResult[]) {
  console.log(`Baseline (${base.model}, engine ${base.engine}): ${describe(base.summary)}`);
  const rate = (rs: EvalResult[], task: string) => {
    const mine = rs.filter((r) => r.task === task);
    return mine.length ? mine.filter((r) => r.passed).length / mine.length : null;
  };
  for (const task of new Set(results.map((r) => r.task))) {
    const before = rate(base.results, task);
    const after = rate(results, task);
    if (before === null || before === after) continue;
    const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
    console.log(`  ${task}: ${pct(before)} → ${pct(after!)} passed${after! > before ? "" : "  (worse)"}`);
  }
  const delta = now.passRate - base.summary.passRate;
  if (delta !== 0)
    console.log(`  Pass rate ${delta > 0 ? "up" : "down"} ${(Math.abs(delta) * 100).toFixed(0)} points.`);
}

/** The engine's commit, marked when there are uncommitted changes, so results can be traced to the code. */
function engineVersion(): string {
  try {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: here, encoding: "utf8" }).trim();
    return git("rev-parse", "--short", "HEAD") + (git("status", "--porcelain", "--", "..") ? "+changes" : "");
  } catch {
    return "unknown";
  }
}
