import { openHumanRequests, replay, type ClientCommand, type RunEvent } from "@orca/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { fakeClient } from "../src/fakeClient.js";
import { startRun, type RunHandle } from "../src/run.js";
import { git, testRepo } from "./helpers.js";

let repo: string;
beforeAll(async () => {
  repo = await testRepo();
});

/** Starts a run on the fake model; `react` sees every event and may send commands back. */
async function fakeRun(runId: string, react: (e: RunEvent, send: (c: ClientCommand) => void) => void, branch?: string) {
  const events: RunEvent[] = [];
  let handle: RunHandle | undefined;
  const send = (c: ClientCommand) => setTimeout(() => handle!.send(c), 5);
  handle = startRun({
    runId,
    title: "Try the desktop flow",
    project: repo,
    branch,
    maxUsd: 1,
    client: fakeClient({ delayMs: 5 }),
    onEvent(e) {
      events.push(e);
      react(e, send);
    },
  });
  await handle.done;
  return { events, state: replay(events)!, handle };
}

const answerAll =
  (response: string) =>
  (e: RunEvent, send: (c: ClientCommand) => void): void => {
    if (e.type === "human.requested")
      send({ type: "human.respond", runId: e.runId, requestId: e.request.id, response });
  };

describe("startRun", () => {
  it("reports a run as RunEvents the UI reducer can rebuild", async () => {
    const { events, state, handle } = await fakeRun("r1", answerAll("Approved"));

    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(state.run.status).toBe("done");
    expect(state.run.summary).toContain("Changes are on branch orca/run-r1");
    expect(Object.keys(state.agents)).toEqual(["builder"]);
    expect(Object.keys(state.subAgents)).toEqual(["builder.worker"]);
    expect(Object.values(state.humanRequests).map((r) => r.type)).toEqual(["approval"]);
    expect(openHumanRequests(state)).toHaveLength(0);
    expect(state.run.budget.spentUsd).toBeGreaterThan(0);
    expect(handle.events()).toEqual(events);
    expect(git(repo, "show", "orca/run-r1:ORCA_DEMO.md")).toContain("fake model");
  });

  it("pauses between turns and resumes", async () => {
    let paused = false;
    const { events, state } = await fakeRun("r2", (e, send) => {
      if (e.type === "human.requested" && !paused) {
        paused = true;
        send({ type: "run.pause", runId: e.runId });
        setTimeout(() => send({ type: "run.resume", runId: e.runId }), 30);
      }
      answerAll("Approved")(e, send);
    });
    const statuses = events.flatMap((e) => (e.type === "run.updated" && e.patch.status ? [e.patch.status] : []));
    expect(statuses).toContain("paused");
    expect(state.run.status).toBe("done");
  });

  it("declined calls don't run", async () => {
    const { state } = await fakeRun("r3", answerAll("Declined"));
    const issues = Object.values(state.messages)
      .filter((m) => m.kind === "issue")
      .map((m) => m.text);
    expect(issues).toContainEqual(expect.stringMatching(/^Not run: Running git stash list\. Denied by the human/));
    // Creating a file needs no yes any more, so the run still has that change on its branch.
    expect(git(repo, "show", "--name-only", "--format=", "orca/run-r3")).toBe("ORCA_DEMO.md");
  });

  it("stop ends a run that is waiting on the human", async () => {
    let handleStop: (() => void) | undefined;
    const events: RunEvent[] = [];
    const handle = startRun({
      runId: "r4",
      title: "stop",
      project: repo,
      maxUsd: 1,
      client: fakeClient({ delayMs: 5 }),
      onEvent(e) {
        events.push(e);
        if (e.type === "human.requested") handleStop?.();
      },
    });
    handleStop = () => handle.stop();
    await handle.done;
    const state = replay(events)!;
    expect(state.run.status).toBe("failed");
    expect(state.run.summary).toMatch(/^Stopped/);
  });

  it("fails cleanly when the branch doesn't exist", async () => {
    const { state } = await fakeRun("r5", () => {}, "no-such-branch");
    expect(state.run.status).toBe("failed");
    expect(state.run.summary).toMatch(/doesn't exist/);
  });
});
