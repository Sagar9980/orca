import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "@langchain/langgraph";
import { beforeAll, describe, expect, it } from "vitest";
import { buildWorker, type WorkerEvent } from "../src/worker.js";
import { endTurn, exists, scriptedClient, testRepo, toolTurn, usage } from "./helpers.js";

let root: string;
beforeAll(async () => {
  root = await testRepo();
});

let threads = 0;

/** Runs a worker on scripted replies until it finishes or pauses at the gate. */
async function run(reply: (n: number) => unknown, options: Partial<Parameters<typeof buildWorker>[0]> = {}) {
  const worker = buildWorker({ root, client: scriptedClient(reply), ...options });
  const thread = { configurable: { thread_id: `w${++threads}` } };
  const events: WorkerEvent[] = [];
  const pass = async (input: Parameters<typeof worker.stream>[0]) => {
    const stream = await worker.stream(input, { ...thread, streamMode: "custom", recursionLimit: 200 });
    for await (const event of stream) events.push(event as WorkerEvent);
    const snapshot = await worker.getState(thread);
    return { state: snapshot.values, interrupts: snapshot.tasks.flatMap((t) => t.interrupts) };
  };
  const first = await pass({ messages: [{ role: "user", content: "go" }] });
  return { ...first, events, resume: (answers: Record<string, boolean>) => pass(new Command({ resume: answers })) };
}

describe("gate", () => {
  it("pauses for asked calls, runs only what was approved, and emits each call once", async () => {
    const calls = [
      { type: "tool_use", id: "read", name: "read_file", input: { path: "package.json" } },
      { type: "tool_use", id: "test", name: "run_command", input: { command: "echo tests ran" } },
      { type: "tool_use", id: "push", name: "run_command", input: { command: "git push" } },
      {
        type: "tool_use",
        id: "create",
        name: "edit_file",
        input: { path: "evil.js", old_string: "", new_string: "x" },
      },
    ];
    const r = await run((n) => (n === 1 ? { stop_reason: "tool_use", usage, content: calls } : endTurn()));

    expect(r.interrupts[0].value).toMatchObject({ calls: [{ id: "test" }, { id: "create" }] });
    expect(r.events.filter((e) => e.kind === "gate")).toHaveLength(0);

    const done = await r.resume({ test: true, create: false });
    const gates = r.events.filter((e) => e.kind === "gate");
    expect(gates.map((e) => [e.id, e.verdict])).toEqual([
      ["read", "allow"],
      ["test", "allow"],
      ["push", "deny"],
      ["create", "deny"],
    ]);
    const results = Object.fromEntries(
      r.events.flatMap((e) => (e.kind === "tool_result" ? [[e.id, e]] : [])),
    ) as Record<string, Extract<WorkerEvent, { kind: "tool_result" }>>;
    expect(results.test.content).toContain("tests ran");
    expect(results.push.isError).toBe(true);
    expect(results.create.content).toBe("Denied by the human.");
    expect(await exists(path.join(root, "evil.js"))).toBe(false);
    expect(done.state.stopReason).toBe("end_turn");
  });
});

describe("limits", () => {
  it("stops at the budget", async () => {
    // Opus prices, so a few scripted turns add up past a tiny budget.
    const r = await run(() => toolTurn("read_file", { path: "package.json" }), {
      model: "claude-opus-5-5",
      maxUsd: 0.0001,
    });
    expect(r.state.limit).toBe("budget");
    expect(r.state.turns).toBe(1);
  });

  it("stops at the turn cap", async () => {
    const r = await run((n) => toolTurn("read_file", { path: n % 2 ? "package.json" : "src/cart.js" }), {
      maxTurns: 4,
    });
    expect(r.state).toMatchObject({ limit: "turns", turns: 4 });
  });

  it("refuses invalid limits", () => {
    expect(() => buildWorker({ root, maxUsd: NaN })).toThrow(/maxUsd/);
    expect(() => buildWorker({ root, maxTurns: 2.5 })).toThrow(/maxTurns/);
    expect(() => buildWorker({ root, model: "gpt-5" })).toThrow();
  });
});

describe("recovery", () => {
  it("stops as stuck when the same calls repeat three turns in a row", async () => {
    const r = await run(() => toolTurn("read_file", { path: "package.json" }));
    expect(r.state).toMatchObject({ limit: "stuck", turns: 3 });
  });

  it("stops as stuck after three rounds where every call failed", async () => {
    const r = await run((n) => toolTurn("read_file", { path: `missing-${n}.js` }));
    expect(r.state).toMatchObject({ limit: "stuck", turns: 3 });
  });

  it("a successful call resets the failure count", async () => {
    const r = await run((n) => toolTurn("read_file", { path: n % 2 ? `missing-${n}.js` : "package.json" }), {
      maxTurns: 8,
    });
    expect(r.state.limit).toBe("turns");
  });

  it("stops on a refusal and reports why", async () => {
    const r = await run(() => ({
      stop_reason: "refusal",
      usage,
      stop_details: { type: "refusal", category: "cyber", explanation: "test refusal" },
      content: [],
    }));
    expect(r.state.stopReason).toBe("refusal");
    expect(r.events).toContainEqual(
      expect.objectContaining({ kind: "stopped", detail: expect.stringContaining("test refusal") }),
    );
  });

  it("doesn't run a tool call cut off by max_tokens", async () => {
    const r = await run(() => ({
      stop_reason: "max_tokens",
      usage,
      content: [{ type: "tool_use", id: "x", name: "edit_file", input: { path: "cut.js", old_string: "" } }],
    }));
    expect(r.state.stopReason).toBe("max_tokens");
    expect(r.events.some((e) => e.kind === "tool_result")).toBe(false);
    expect(await fs.readdir(root)).not.toContain("cut.js");
  });

  it("sends tool errors back to the model so it can recover", async () => {
    const r = await run((n) => (n === 1 ? toolTurn("read_file", { path: "missing.js" }) : endTurn("Recovered.")));
    expect(r.state.stopReason).toBe("end_turn");
    expect(r.events).toContainEqual(expect.objectContaining({ kind: "tool_result", isError: true }));
  });
});
