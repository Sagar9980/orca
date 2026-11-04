import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Command } from "@langchain/langgraph";
import { DEFAULT_MODEL } from "./models.js";
import { buildWorker, type ApprovalAnswer, type ApprovalRequest, type WorkerEvent } from "./worker.js";

// Run one worker on a temporary copy of a project, print every step, and ask y/n when the gate needs a human.
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

const root = await fs.mkdtemp(path.join(os.tmpdir(), "orca-run-"));
await fs.cp(source, root, { recursive: true, filter: (p) => !p.includes(`${path.sep}node_modules`) });
console.log(`Working on a copy of ${source}\n  in ${root}\n  ${model}, budget $${maxUsd}, up to ${maxTurns} turns\n`);

const worker = buildWorker({ root, model, maxTurns, maxUsd });
const thread = { configurable: { thread_id: randomUUID() } };
const rl = createInterface({ input: process.stdin, output: process.stdout });

// Each pass runs until the graph finishes or pauses at the gate; a pause is answered here and resumed.
let input: Parameters<typeof worker.stream>[0] = { messages: [{ role: "user", content: task }] };
while (true) {
  const stream = await worker.stream(input, { ...thread, streamMode: "custom", recursionLimit: maxTurns * 3 + 5 });
  for await (const event of stream) print(event as WorkerEvent);

  const snapshot = await worker.getState(thread);
  const pending = snapshot.tasks.flatMap((t) => t.interrupts);
  if (!pending.length) break;
  input = new Command({ resume: await askHuman(pending[0].value as ApprovalRequest) });
}
rl.close();

const { usage, turns, stopReason, limit, spentUsd } = (await worker.getState(thread)).values;
console.log(`\n\nStopped: ${limit ? `${limit} limit` : stopReason} after ${turns} turns`);
console.log(
  `Tokens: ${usage.input} in, ${usage.cacheRead} cache read, ${usage.cacheWrite} cache write, ${usage.output} out`,
);
console.log(`Cost: $${spentUsd.toFixed(4)}`);
console.log(`Result is in ${root}`);

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
  }
}
