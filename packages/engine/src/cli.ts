import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildWorker, costUsd, type WorkerEvent, type WorkerStateType } from "./worker.js";

// Phase A: run one worker on a temporary copy of a project and print every step.
// Usage: pnpm --filter @orca/engine fix [project folder] [task]

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(process.argv[2] ?? path.join(here, "../fixtures/buggy-project"));
const task = process.argv[3] ?? "The tests fail. Fix the bugs so `npm test` passes.";
const maxTurns = 30;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY in packages/engine/.env (see .env.example).");
  process.exit(1);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "orca-run-"));
await fs.cp(source, root, { recursive: true, filter: (p) => !p.includes(`${path.sep}node_modules`) });
console.log(`Working on a copy of ${source}\n  in ${root}\n`);

const worker = buildWorker({ root, maxTurns });
const stream = await worker.stream(
  { messages: [{ role: "user", content: task }] },
  { streamMode: ["custom", "values"], recursionLimit: maxTurns * 2 + 5 },
);

let final: WorkerStateType | undefined;
for await (const [mode, chunk] of stream) {
  if (mode === "values") final = chunk as WorkerStateType;
  else print(chunk as WorkerEvent);
}

if (final) {
  const { usage, turns, stopReason } = final;
  console.log(`\n\nStopped: ${stopReason} after ${turns} turns`);
  console.log(
    `Tokens: ${usage.input} in, ${usage.cacheRead} cache read, ${usage.cacheWrite} cache write, ${usage.output} out`,
  );
  console.log(`Cost: $${costUsd(usage).toFixed(4)}`);
  console.log(`Result is in ${root}`);
}

function print(event: WorkerEvent) {
  switch (event.kind) {
    case "text":
      process.stdout.write(event.text);
      break;
    case "tool_call":
      console.log(`\n→ ${event.name} ${JSON.stringify(event.input)}`);
      break;
    case "tool_result": {
      const lines = event.content.trimEnd().split("\n");
      const shown = lines.slice(0, 12).map((l) => `  │ ${l}`);
      if (lines.length > 12) shown.push(`  │ … ${lines.length - 12} more lines`);
      console.log(`${event.isError ? "  ✗ error" : "  ✓"}\n${shown.join("\n")}`);
      break;
    }
    case "turn":
      console.log(`\n[turn ${event.turn} · ${event.stopReason} · cache read ${event.usage.cacheRead}]`);
      break;
  }
}
