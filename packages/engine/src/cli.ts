import { randomUUID } from "node:crypto";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { Command } from "@langchain/langgraph";
import { DEFAULT_MODEL } from "./models.js";
import { buildWorker, type ApprovalAnswer, type ApprovalRequest, type WorkerEvent } from "./worker.js";
import { closeWorkspace, fixtureRepo, openWorkspace } from "./workspace.js";

// Run one worker on its own branch of a project, print every step, and ask y/n when the gate needs a human.
// The project must be in a git repo; with no project given, it runs on the built-in test project.
// Usage: pnpm --filter @orca/engine fix [project folder] [task] [--model claude-opus-5-5] [--budget 0.25] [--turns 30]

const here = path.dirname(fileURLToPath(import.meta.url));
// pnpm passes a literal "--" through to the script, which would turn every flag after it into a positional.
const argv = process.argv.slice(2).filter((arg, i) => !(i === 0 && arg === "--"));
const { positionals, values } = parseArgs({
  args: argv,
  allowPositionals: true,
  options: {
    model: { type: "string", default: DEFAULT_MODEL },
    budget: { type: "string", default: "0.25" },
    turns: { type: "string", default: "30" },
  },
});
const source = path.resolve(positionals[0] ?? path.join(here, "../fixtures/buggy-project"));
const task = positionals[1] ?? "The tests fail. Fix the bugs so `npm test` passes.";
const model = values.model;
const maxUsd = Number(values.budget);
const maxTurns = Number(values.turns);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY in packages/engine/.env (see .env.example).");
  process.exit(1);
}

// The built-in test project isn't a repo of its own, so it gets a throwaway one and runs like a real project.
const project = positionals[0] ? source : await fixtureRepo(source);
const runId = randomUUID().slice(0, 8);
const ws = await openWorkspace(project, runId);
console.log(`Working on branch ${ws.branch} of ${ws.repo}\n  in ${ws.root}`);
console.log(`  ${model}, budget $${maxUsd}, up to ${maxTurns} turns\n`);
if (ws.dirty)
  console.log("  Note: the repo has uncommitted changes. They stay untouched and aren't part of this run.\n");

const worker = buildWorker({ root: ws.root, model, maxTurns, maxUsd });
const thread = { configurable: { thread_id: runId } };
const rl = createInterface({ input: process.stdin, output: process.stdout });

// Each pass runs until the graph finishes or pauses at the gate; a pause is answered here and resumed.
let summary = "Stopped: crashed";
try {
  let input: Parameters<typeof worker.stream>[0] = { messages: [{ role: "user", content: task }] };
  while (true) {
    const stream = await worker.stream(input, { ...thread, streamMode: "custom", recursionLimit: maxTurns * 3 + 5 });
    for await (const event of stream) print(event as WorkerEvent);

    const snapshot = await worker.getState(thread);
    const pending = snapshot.tasks.flatMap((t) => t.interrupts);
    if (!pending.length) break;
    input = new Command({ resume: await askHuman(pending[0].value as ApprovalRequest) });
  }

  const { usage, turns, stopReason, limit, spentUsd } = (await worker.getState(thread)).values;
  summary = `Stopped: ${limit ? `${limit} limit` : stopReason} after ${turns} turns, $${spentUsd.toFixed(4)} on ${model}`;
  console.log(`\n\n${summary}`);
  console.log(
    `Tokens: ${usage.input} in, ${usage.cacheRead} cache read, ${usage.cacheWrite} cache write, ${usage.output} out`,
  );
} catch (err) {
  // Retryable API errors (429, 5xx, network) were already retried by the SDK; what reaches here won't fix itself.
  if (!(err instanceof Anthropic.APIError)) throw err;
  summary = `Stopped: API error ${err.status ?? ""}`.trim();
  if (err instanceof Anthropic.AuthenticationError)
    console.error("\n\nThe API key was rejected. Check packages/engine/.env.");
  else if (err instanceof Anthropic.RateLimitError)
    console.error("\n\nStill rate limited after retries. Try again later.");
  else console.error(`\n\nThe API returned an error: ${err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  // Even a crashed or stopped run keeps its changes on the branch, so nothing the agent did is lost.
  const firstLine = `Orca: ${task.split("\n")[0]}`.slice(0, 72);
  const { committed } = await closeWorkspace(ws, `${firstLine}\n\n${summary}`);
  console.log(
    committed
      ? `Changes are on branch ${ws.branch}. Review with:\n  git -C "${ws.repo}" diff HEAD...${ws.branch}`
      : "No changes, so no branch was kept.",
  );
}

async function askHuman(request: ApprovalRequest): Promise<ApprovalAnswer> {
  const answers: ApprovalAnswer = {};
  for (const call of request.calls) {
    console.log(`\n? ${call.name} ${JSON.stringify(call.input)}\n  (${call.reason})`);
    const reply = await rl.question("  Allow? [y/N] ").catch(() => "");
    answers[call.id] = /^y(es)?$/i.test(reply.trim());
  }
  return answers;
}

function print(event: WorkerEvent) {
  switch (event.kind) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "gate":
      console.log(
        `\n→ ${event.name} ${JSON.stringify(event.input)}${event.verdict === "deny" ? `\n  ⛔ ${event.reason}` : ""}`,
      );
      break;
    case "tool_result": {
      const lines = event.content.trimEnd().split("\n");
      const shown = lines.slice(0, 12).map((l) => `  │ ${l}`);
      if (lines.length > 12) shown.push(`  │ … ${lines.length - 12} more lines`);
      console.log(`${event.isError ? "  ✗ error" : "  ✓"}\n${shown.join("\n")}`);
      break;
    }
    case "turn":
      console.log(
        `\n[turn ${event.turn} · ${event.stopReason} · cache read ${event.usage.cacheRead} · $${event.spentUsd.toFixed(4)}]`,
      );
      break;
    case "limit":
      console.log(`\n■ Stopping: ${event.detail}`);
      break;
    case "stopped":
      console.log(`\n■ ${event.detail}`);
      break;
  }
}
