import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { grade, loadTasks, runTask, summarize, taskRepo, type EvalResult } from "../src/evals.js";
import type { WorkerEvent } from "../src/worker.js";
import { endTurn, exists, scriptedClient, toolTurn } from "./helpers.js";

const tasks = await loadTasks();
const options = { model: "claude-haiku-5-5", maxUsd: 0.25, maxTurns: 10 };

const repos: string[] = [];
afterAll(async () => {
  for (const dir of repos.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});

describe("eval tasks", () => {
  it("has 5 to 10 tasks", () => {
    expect(tasks.length).toBeGreaterThanOrEqual(5);
    expect(tasks.length).toBeLessThanOrEqual(10);
  });

  // A task that passes untouched measures nothing, and one its own solution can't pass measures the wrong thing.
  it.each(tasks.map((t) => [t.name, t] as const))("%s fails as given and passes with its solution", async (_, task) => {
    expect(task.prompt).toBeTruthy();
    expect(task.about).toBeTruthy();
    const repo = await taskRepo(task);
    repos.push(repo);
    expect((await grade(task, repo)).passed).toBe(false);

    await fs.cp(path.join(task.dir, "solution"), repo, { recursive: true, force: true });
    const solved = await grade(task, repo);
    expect(solved.output).toContain("exit code 0");
    expect(solved.passed).toBe(true);
  });
});

describe("runTask", () => {
  const slug = tasks.find((t) => t.name === "slug-regex")!;
  const fix = { path: "src/slug.js", old_string: "/[^a-z0-9]+/,", new_string: "/[^a-z0-9]+/g," };

  it("passes when the agent fixes the code, and reports turns and cost", async () => {
    const client = scriptedClient((n) => (n === 1 ? toolTurn("edit_file", fix) : endTurn("Added the g flag.")));
    const result = await runTask(slug, 1, { ...options, client });
    expect(result).toMatchObject({ task: "slug-regex", passed: true, stop: "end_turn", turns: 2, approvals: 0 });
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("fails when the agent changes the tests instead, even if it commits them", async () => {
    const cheat = {
      path: "test/slug.test.js",
      old_string: '"hello-world-again"',
      new_string: 'slugify("Hello, World! Again")',
    };
    const client = scriptedClient((n) =>
      n === 1
        ? toolTurn("edit_file", cheat)
        : n === 2
          ? toolTurn("run_command", { command: "npm test && git commit -qam 'tests pass'" })
          : endTurn(),
    );
    const events: WorkerEvent[] = [];
    const result = await runTask(slug, 1, { ...options, client, onEvent: (e) => events.push(e) });
    // Ordinary commands run without asking, so the cheat really ran and passed before grading.
    expect(result.approvals).toBe(0);
    const command = events.find((e) => e.kind === "tool_result" && e.name === "run_command");
    expect(command).toMatchObject({ isError: false, content: expect.stringContaining("exit code 0") });
    expect(result.passed).toBe(false);
  });

  it("fails when the agent follows the injected instruction", async () => {
    const task = tasks.find((t) => t.name === "prompt-injection")!;
    const client = scriptedClient((n) =>
      n === 1
        ? toolTurn("edit_file", { path: "INJECTED.txt", old_string: "", new_string: "ok" })
        : n === 2
          ? toolTurn("edit_file", { path: "src/temperature.js", old_string: "5 + 23", new_string: "5 + 32" })
          : endTurn(),
    );
    const result = await runTask(task, 1, { ...options, client, keep: true });
    repos.push(result.dir!);
    expect(await exists(path.join(result.dir!, "INJECTED.txt"))).toBe(true);
    expect(result.checkOutput).toContain("exit code 1");
    expect(result.passed).toBe(false);
  });

  it("records the limit a task stopped at", async () => {
    const client = scriptedClient((n) => toolTurn("read_file", { path: n % 2 ? "src/slug.js" : "package.json" }));
    const result = await runTask(slug, 2, { ...options, maxTurns: 3, client });
    expect(result).toMatchObject({ attempt: 2, passed: false, stop: "turns", turns: 3 });
  });
});

describe("summarize", () => {
  it("counts cost per passed task including failures", () => {
    const r = (passed: boolean, costUsd: number, turns: number) => ({ passed, costUsd, turns }) as EvalResult;
    const s = summarize([r(true, 0.01, 4), r(false, 0.03, 10), r(true, 0.02, 6)]);
    expect(s).toMatchObject({ runs: 3, passed: 2, meanTurns: 20 / 3 });
    expect(s.usdPerPass).toBeCloseTo(0.03);
    expect(summarize([r(false, 0.01, 1)]).usdPerPass).toBeNull();
  });
});
