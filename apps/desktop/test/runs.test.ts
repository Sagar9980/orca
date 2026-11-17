import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LandAction, RunEvent } from "@orca/shared";
import { afterAll, describe, expect, it, vi } from "vitest";

// Reopening saved runs after a restart. Electron is replaced with a temporary data folder.
const data = fs.mkdtempSync(path.join(os.tmpdir(), "orca-desktop-"));
vi.mock("electron", () => ({
  app: { getPath: () => data },
  shell: { openExternal: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
}));
const { attachRun } = await import("../src/runs");

afterAll(() => fs.rmSync(data, { recursive: true, force: true }));

const at = "2026-11-17T00:00:00.000Z";
let n = 0;

/** A run that started and finished, followed by `rest`; saved to its log. Returns its id. */
function saved(rest: (runId: string, seq: () => number) => RunEvent[], finish = true): string {
  const runId = `saved${++n}`;
  let seq = 0;
  const next = () => ++seq;
  const events: RunEvent[] = [
    {
      type: "run.started",
      runId,
      seq: next(),
      at,
      run: { id: runId, title: "t", status: "running", plan: [], budget: { limitUsd: 1, spentUsd: 0 }, startedAt: at },
    },
    ...(finish ? [{ type: "run.finished", runId, seq: next(), at, status: "done", summary: "ok" } as RunEvent] : []),
  ];
  events.push(...rest(runId, next));
  fs.mkdirSync(path.join(data, "runs"), { recursive: true });
  fs.writeFileSync(path.join(data, "runs", `${runId}.jsonl`), events.map((e) => JSON.stringify(e) + "\n").join(""));
  return runId;
}

const landing =
  (action: LandAction) =>
  (runId: string, seq: () => number): RunEvent => ({
    type: "run.updated",
    runId,
    seq: seq(),
    at,
    patch: { landed: { action, note: `${action}d` }, ...(action === "push" ? {} : { workBranch: null }) },
  });

const lines = (runId: string) =>
  fs
    .readFileSync(path.join(data, "runs", `${runId}.jsonl`), "utf8")
    .trim()
    .split("\n");

describe("reopening a saved run", () => {
  it.each(["merge", "push", "discard"] as const)("keeps a finished run finished after a %s", (action) => {
    const runId = saved((id, seq) => [landing(action)(id, seq)]);
    const events = attachRun(runId);
    expect(events.map((e) => e.type)).toEqual(["run.started", "run.finished", "run.updated"]);
    expect(events.at(-1)).toMatchObject({ patch: { landed: { action } } });
    expect(lines(runId)).toHaveLength(3);
  });

  it("keeps it finished after several landings", () => {
    const runId = saved((id, seq) => [landing("push")(id, seq), landing("merge")(id, seq)]);
    expect(attachRun(runId).filter((e) => e.type === "run.finished")).toHaveLength(1);
  });

  it("still closes out a run that never finished", () => {
    const runId = saved(() => [], false);
    expect(attachRun(runId).at(-1)).toMatchObject({ type: "run.finished", status: "failed" });
  });

  it("still closes out a run whose events after run.finished aren't landings", () => {
    const bogus = (runId: string, seq: () => number) =>
      ({
        type: "run.updated",
        runId,
        seq: seq(),
        at,
        patch: { landed: { action: "rebase", note: "x" } },
      }) as unknown as RunEvent;
    const runId = saved((id, seq) => [bogus(id, seq)]);
    expect(attachRun(runId).at(-1)).toMatchObject({ type: "run.finished", status: "failed" });
  });
});
