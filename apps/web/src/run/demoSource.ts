import {
  applyEvent,
  HUMAN,
  openHumanRequests,
  ORCHESTRATOR,
  type ClientCommand,
  type MessageKind,
  type ParticipantId,
  type RunEvent,
  type RunState,
  type SubAgent,
} from "@orca/shared";
import type { RunSource } from "./source";
import {
  PLAN,
  RUN_BUDGET_USD,
  RUN_DETAIL,
  RUN_SUMMARY,
  RUN_TITLE,
  TEAMS,
  type Step,
  type TeamScript,
} from "./demoScript";

/** Time a message takes to "arrive", matching the UI's packet animation. */
const TRAVEL_MS = 1200;
const STEP_GAP_MS = 2300;

type Payload<T extends RunEvent["type"]> = Omit<Extract<RunEvent, { type: T }>, "type" | "runId" | "seq" | "at">;

class Cancelled extends Error {}

/**
 * Plays the scripted "Add payments" run in the browser, emitting the same
 * events the real orchestrator will. Pause, resume and human answers work.
 */
export function createDemoSource(): RunSource {
  const listeners = new Set<(event: RunEvent) => void>();
  let log: RunEvent[] = [];
  let state: RunState | undefined;
  let runId = "";
  let seq = 0;
  let gen = 0;
  let paused = false;
  let pausedAt = 0;
  let pausedMs = 0;
  let resumeWaiters: (() => void)[] = [];
  let tokenTimer: ReturnType<typeof setInterval> | undefined;
  const humanWaiters = new Map<string, (response: string) => void>();

  function emit<T extends RunEvent["type"]>(type: T, payload: Payload<T>) {
    const event = { type, runId, seq: ++seq, at: new Date().toISOString(), ...payload } as unknown as RunEvent;
    log.push(event);
    state = applyEvent(state, event);
    for (const listener of listeners) listener(event);
  }

  /** Milliseconds of un-paused time since the page loaded. Stands still while paused. */
  const activeClock = () => Date.now() - pausedMs - (paused ? Date.now() - pausedAt : 0);

  // One timer per wait (not short polling chunks): background tabs throttle
  // timers to about one per second, which would slow chunked waits ~10x.
  async function sleep(ms: number, myGen: number) {
    const until = activeClock() + ms;
    for (;;) {
      if (myGen !== gen) throw new Cancelled();
      if (paused) {
        await new Promise<void>((resolve) => resumeWaiters.push(resolve));
        continue;
      }
      const left = until - activeClock();
      if (left <= 0) return;
      await new Promise((resolve) => setTimeout(resolve, left));
    }
  }

  function setPaused(next: boolean) {
    if (next === paused) return;
    if (next) pausedAt = Date.now();
    else pausedMs += Date.now() - pausedAt;
    paused = next;
    if (!next) resumeWaiters.splice(0).forEach((resume) => resume());
  }

  const subId = (team: TeamScript, local: string) => (local === "you" ? HUMAN : `${team.id}.${local}`);
  const nameOf = (id: ParticipantId) =>
    id === HUMAN ? "you" : id === ORCHESTRATOR ? "Orca" : (state?.subAgents[id]?.name ?? id);

  function updateSub(id: string, patch: Partial<Pick<SubAgent, "state" | "activity" | "waitingOn" | "tokens">>) {
    emit("subagent.updated", { subAgentId: id, patch });
  }

  function sendMessage(team: TeamScript, from: ParticipantId, to: ParticipantId, kind: MessageKind, text: string) {
    emit("message.sent", {
      message: { id: `m${seq + 1}`, runId, agentId: team.id, from, to, kind, text, at: new Date().toISOString() },
    });
  }

  async function playStep(team: TeamScript, step: Step, myGen: number) {
    const [fromLocal, toLocal, kind, text, toActivity, fromActivity, ask] = step;
    const from = subId(team, fromLocal);
    const to = subId(team, toLocal);

    if (kind === "ask_human") {
      const requestId = `h${seq + 1}`;
      sendMessage(team, from, HUMAN, "question", text);
      emit("human.requested", {
        request: {
          id: requestId,
          runId,
          agentId: team.id,
          from,
          type: ask?.type ?? "information",
          prompt: text,
          options: ask?.options,
          recommended: ask?.recommended,
          status: "open",
          at: new Date().toISOString(),
        },
      });
      updateSub(from, { state: "needs_human", waitingOn: HUMAN, activity: "Waiting on you" });
      emit("agent.updated", { agentId: team.id, patch: { status: "needs_human", summary: "Needs you to answer" } });
      if (!paused) emit("run.updated", { patch: { status: "needs_human" } });

      const response = await new Promise<string>((resolve) => humanWaiters.set(requestId, resolve));
      if (myGen !== gen) throw new Cancelled();
      emit("human.responded", { requestId, response });
      sendMessage(team, HUMAN, from, "reply", response);
      if (!paused && state && openHumanRequests(state).length === 0) emit("run.updated", { patch: { status: "running" } });
      await sleep(TRAVEL_MS, myGen);
      updateSub(from, { state: "working", waitingOn: null, activity: toActivity ?? "Continuing" });
      emit("agent.updated", { agentId: team.id, patch: { status: "working", summary: toActivity ?? "Continuing" } });
      return;
    }

    sendMessage(team, from, to, kind, text);
    await sleep(TRAVEL_MS, myGen);

    const receiver = state?.subAgents[to];
    updateSub(to, {
      state: "working",
      activity: toActivity ?? receiver?.activity ?? "",
      ...(receiver?.waitingOn === from ? { waitingOn: null } : {}),
    });

    if (kind === "question") {
      updateSub(from, { state: "waiting", waitingOn: to, activity: `Waiting on ${nameOf(to)}` });
    } else if (kind === "issue") {
      updateSub(from, { state: "issue", activity: fromActivity ?? "Issue reported" });
    } else if (kind === "reply") {
      updateSub(from, { state: "done", waitingOn: null, activity: fromActivity ?? "Handed off" });
    } else if (fromActivity) {
      updateSub(from, { state: "working", activity: fromActivity });
    } else {
      updateSub(from, { state: "working" });
    }

    emit(
      "agent.updated",
      kind === "issue"
        ? { agentId: team.id, patch: { status: "issue", summary: text } }
        : { agentId: team.id, patch: { status: "working", summary: toActivity ?? text } },
    );
  }

  async function runTeam(team: TeamScript, myGen: number, after?: Promise<unknown>) {
    if (after) {
      await after;
      if (myGen !== gen) throw new Cancelled();
      emit("run.plan_updated", {
        plan: PLAN.map((p) =>
          p.id === "execute" ? { ...p, status: "done" } : p.id === "verify" ? { ...p, status: "active" } : p,
        ),
      });
      emit("agent.updated", { agentId: team.id, patch: { status: "working", summary: team.subs[0].activity } });
      updateSub(subId(team, team.subs[0].id), { state: "working" });
    }
    await sleep(400 + Math.random() * 2200, myGen);
    const lead = subId(team, team.subs[0].id);
    sendMessage(team, ORCHESTRATOR, lead, "prompt", team.brief);
    await sleep(STEP_GAP_MS, myGen);

    for (const step of team.steps) {
      await playStep(team, step, myGen);
      await sleep(STEP_GAP_MS + Math.random() * 1400, myGen);
    }

    sendMessage(team, lead, ORCHESTRATOR, "reply", team.finish);
    updateSub(lead, { state: "done", waitingOn: null, activity: "Reported to Orca" });
    emit("agent.updated", { agentId: team.id, patch: { status: "done", summary: team.finish } });
  }

  function tickTokens(myGen: number) {
    if (paused || myGen !== gen || !state) return;
    let added = 0;
    for (const sub of Object.values(state.subAgents)) {
      if (sub.state !== "working") continue;
      const more = 60 + Math.floor(Math.random() * 260);
      added += more;
      updateSub(sub.id, { tokens: sub.tokens + more });
    }
    if (added) {
      const spent = Math.min(RUN_BUDGET_USD * 0.95, state.run.budget.spentUsd + added * 0.000012);
      emit("run.spend", { spentUsd: Number(spent.toFixed(4)) });
    }
  }

  function startRun() {
    const myGen = ++gen;
    clearInterval(tokenTimer);
    log = [];
    state = undefined;
    seq = 0;
    setPaused(false);
    humanWaiters.clear();
    runId = `demo-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    emit("run.started", {
      run: {
        id: runId,
        title: RUN_TITLE,
        detail: RUN_DETAIL,
        status: "running",
        plan: PLAN,
        budget: { limitUsd: RUN_BUDGET_USD, spentUsd: 0 },
        startedAt: now,
      },
    });
    for (const team of TEAMS) {
      emit("agent.spawned", {
        agent: {
          id: team.id,
          runId,
          name: team.name,
          mission: team.mission,
          status: team.runsLast ? "queued" : "working",
          summary: team.summary,
        },
      });
      team.subs.forEach((sub, i) => {
        emit("subagent.spawned", {
          subAgent: {
            id: subId(team, sub.id),
            agentId: team.id,
            name: sub.name,
            role: sub.role,
            state: sub.state ?? "idle",
            activity: sub.activity,
            waitingOn: null,
            tokens: sub.state === "working" ? 1800 + i * 610 : 0,
          },
        });
      });
    }

    tokenTimer = setInterval(() => tickTokens(myGen), 1500);

    const firstWave = Promise.all(TEAMS.filter((t) => !t.runsLast).map((team) => runTeam(team, myGen)));
    const lastWave = Promise.all(TEAMS.filter((t) => t.runsLast).map((team) => runTeam(team, myGen, firstWave)));
    Promise.all([firstWave, lastWave])
      .then(() => {
        if (myGen !== gen) return;
        clearInterval(tokenTimer);
        emit("run.plan_updated", { plan: PLAN.map((p) => ({ ...p, status: "done" })) });
        emit("run.finished", { status: "done", summary: RUN_SUMMARY });
      })
      .catch((err) => {
        if (!(err instanceof Cancelled)) console.error(err);
      });
  }

  function send(command: ClientCommand) {
    switch (command.type) {
      case "run.create":
        startRun();
        break;
      case "run.pause":
        if (command.runId !== runId || paused || state?.run.finishedAt) return;
        setPaused(true);
        emit("run.updated", { patch: { status: "paused" } });
        break;
      case "run.resume":
        if (command.runId !== runId || !paused) return;
        setPaused(false);
        emit("run.updated", {
          patch: { status: state && openHumanRequests(state).length ? "needs_human" : "running" },
        });
        break;
      case "human.respond": {
        if (command.runId !== runId) return;
        const resolve = humanWaiters.get(command.requestId);
        humanWaiters.delete(command.requestId);
        resolve?.(command.response);
        break;
      }
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (log.length === 0) startRun();
      else for (const event of log) listener(event);
      return () => {
        listeners.delete(listener);
      };
    },
    send,
  };
}
