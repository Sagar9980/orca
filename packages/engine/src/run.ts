import Anthropic from "@anthropic-ai/sdk";
import { Command } from "@langchain/langgraph";
import {
  HUMAN,
  ORCHESTRATOR,
  type AgentStatus,
  type ClientCommand,
  type MessageKind,
  type ParticipantId,
  type PlanStep,
  type RunEvent,
  type SubAgent,
} from "@orca/shared";
import { DEFAULT_MODEL } from "./models.js";
import { buildWorker, type ApprovalAnswer, type ApprovalRequest, type WorkerEvent } from "./worker.js";
import { closeWorkspace, openWorkspace } from "./workspace.js";

// One run of one worker, reported as the same RunEvents the UI already draws. Until the orchestrator exists
// (Phase E) a run is a single Builder agent with one worker. The worker pauses before every model call, so
// Pause takes effect between turns and the run continues from its checkpoint.

const AGENT = "builder";
const WORKER = "builder.worker";

export interface StartRunOptions {
  runId: string;
  /** The user's task, in their own words. */
  title: string;
  /** Project folder on this computer; must be in a git repo. */
  project: string;
  /** Branch to start from; the repo's current HEAD when left out. */
  branch?: string;
  model?: string;
  maxUsd: number;
  maxTurns?: number;
  /** Pass `fakeClient()` to try runs without spending anything. */
  client?: Anthropic;
  onEvent: (event: RunEvent) => void;
}

export interface RunHandle {
  /** Pause, resume and answers to approval requests. */
  send(command: ClientCommand): void;
  /** Ends the run at the next safe point; open approvals count as denied. */
  stop(): void;
  /** Everything emitted so far, for a window that attaches late. */
  events(): RunEvent[];
  done: Promise<void>;
}

type Payload<T extends RunEvent["type"]> = Omit<Extract<RunEvent, { type: T }>, "type" | "runId" | "seq" | "at">;

export function startRun(options: StartRunOptions): RunHandle {
  const { runId, title, project, branch, model = DEFAULT_MODEL, maxUsd, maxTurns = 30, client, onEvent } = options;
  const log: RunEvent[] = [];
  let seq = 0;
  let paused = false;
  let stopped = false;
  let wake: (() => void) | null = null;
  /** Open approval requests: request id -> the call's answer. */
  const waiting = new Map<string, (approved: boolean) => void>();

  function emit<T extends RunEvent["type"]>(type: T, payload: Payload<T>) {
    const event = { type, runId, seq: ++seq, at: new Date().toISOString(), ...payload } as unknown as RunEvent;
    log.push(event);
    onEvent(event);
  }
  const message = (from: ParticipantId, to: ParticipantId, kind: MessageKind, text: string) =>
    emit("message.sent", {
      message: { id: `m${seq + 1}`, runId, agentId: AGENT, from, to, kind, text, at: new Date().toISOString() },
    });
  const status = (agent: AgentStatus, sub: Partial<Pick<SubAgent, "state" | "activity" | "waitingOn">>) => {
    emit("agent.updated", {
      agentId: AGENT,
      patch: { status: agent, ...(sub.activity ? { summary: sub.activity } : {}) },
    });
    emit("subagent.updated", { subAgentId: WORKER, patch: sub });
  };
  const plan = (work: PlanStep["status"], report: PlanStep["status"]): PlanStep[] => [
    { id: "work", label: "Work on a branch", status: work },
    { id: "report", label: "Report", status: report },
  ];
  const nudge = () => {
    wake?.();
    wake = null;
  };
  const waitWhilePaused = async () => {
    while (paused && !stopped) await new Promise<void>((resolve) => (wake = resolve));
  };

  async function askHuman(request: ApprovalRequest): Promise<ApprovalAnswer> {
    const answers: ApprovalAnswer = {};
    const asked = request.calls.map(
      (call) =>
        new Promise<void>((resolve) => {
          waiting.set(call.id, (approved) => {
            answers[call.id] = approved;
            resolve();
          });
          const prompt = `${askText(call.name, call.input)} (${call.reason})`;
          message(WORKER, HUMAN, "question", prompt);
          emit("human.requested", {
            request: {
              id: call.id,
              runId,
              agentId: AGENT,
              from: WORKER,
              type: "approval",
              prompt,
              status: "open",
              at: now(),
            },
          });
        }),
    );
    status("needs_human", { state: "needs_human", waitingOn: HUMAN, activity: "Waiting on you" });
    if (!paused) emit("run.updated", { patch: { status: "needs_human" } });
    await Promise.all(asked);
    if (!paused) emit("run.updated", { patch: { status: "running" } });
    status("working", { state: "working", waitingOn: null, activity: "Continuing" });
    return answers;
  }

  let tokens = 0;
  let turnText = "";
  let lastText = "";
  function onWorkerEvent(event: WorkerEvent) {
    switch (event.kind) {
      case "text":
        turnText += event.text;
        break;
      case "turn":
        if (turnText.trim()) {
          lastText = turnText.trim();
          message(WORKER, ORCHESTRATOR, "reply", lastText);
        }
        turnText = "";
        tokens += event.usage.input + event.usage.cacheRead + event.usage.cacheWrite + event.usage.output;
        emit("run.spend", { spentUsd: event.spentUsd });
        emit("subagent.updated", { subAgentId: WORKER, patch: { tokens } });
        break;
      case "gate":
        if (event.verdict === "allow")
          status("working", { state: "working", activity: doingText(event.name, event.input) });
        else message(WORKER, ORCHESTRATOR, "issue", `Not run: ${doingText(event.name, event.input)}. ${event.reason}`);
        break;
      case "limit":
      case "stopped":
        message(WORKER, ORCHESTRATOR, "issue", event.detail);
        break;
    }
  }

  async function run() {
    emit("run.started", {
      run: {
        id: runId,
        title,
        status: "running",
        plan: plan("active", "pending"),
        budget: { limitUsd: maxUsd, spentUsd: 0 },
        startedAt: now(),
      },
    });
    let ws: Awaited<ReturnType<typeof openWorkspace>>;
    try {
      ws = await openWorkspace(project, runId, branch);
    } catch (err) {
      emit("run.finished", { status: "failed", summary: errorText(err) });
      return;
    }
    emit("run.updated", { patch: { detail: `on ${ws.branch}` } });
    emit("agent.spawned", {
      agent: { id: AGENT, runId, name: "Builder", mission: title, status: "working", summary: "Reading the code" },
    });
    emit("subagent.spawned", {
      subAgent: {
        id: WORKER,
        agentId: AGENT,
        name: "Worker",
        role: model,
        state: "working",
        activity: "Reading the code",
        waitingOn: null,
        tokens: 0,
      },
    });
    message(ORCHESTRATOR, WORKER, "prompt", title);

    let summary = "";
    let ok = false;
    try {
      const worker = buildWorker({ root: ws.root, model, maxTurns, maxUsd, ...(client ? { client } : {}) });
      const thread = { configurable: { thread_id: runId } };
      let input: Parameters<typeof worker.stream>[0] = { messages: [{ role: "user", content: title }] };
      while (!stopped) {
        const stream = await worker.stream(input, {
          ...thread,
          streamMode: "custom",
          interruptBefore: ["model"],
          recursionLimit: maxTurns * 3 + 5,
        });
        for await (const event of stream) onWorkerEvent(event as WorkerEvent);

        const snapshot = await worker.getState(thread);
        const pending = snapshot.tasks.flatMap((t) => t.interrupts);
        if (pending.length) input = new Command({ resume: await askHuman(pending[0].value as ApprovalRequest) });
        else if (snapshot.next.includes("model")) {
          await waitWhilePaused();
          input = null;
        } else break;
      }
      const { stopReason, limit, turns, spentUsd } = (await worker.getState(thread)).values;
      ok = !stopped && !limit && stopReason === "end_turn";
      const why = stopped ? "Stopped." : limit ? `Stopped at the ${limit} limit.` : ok ? "" : `Stopped: ${stopReason}.`;
      summary = [why, ok ? lastText : "", `${turns} turns, $${spentUsd.toFixed(4)} on ${model}.`]
        .filter(Boolean)
        .join(" ");
    } catch (err) {
      summary = errorText(err);
      message(WORKER, ORCHESTRATOR, "issue", summary);
    } finally {
      // Even a failed or stopped run keeps its changes on the branch.
      const firstLine = `Orca: ${title.split("\n")[0]}`.slice(0, 72);
      const kept = await closeWorkspace(ws, `${firstLine}\n\n${summary}`).then(
        ({ committed }) => (committed ? `Changes are on branch ${ws.branch}.` : "No changes were made."),
        (err) => `Couldn't save the branch: ${errorText(err)}`,
      );
      summary = `${summary} ${kept}`.trim();
    }
    emit("subagent.updated", {
      subAgentId: WORKER,
      patch: { state: ok ? "done" : "issue", activity: ok ? "Reported to Orca" : "Stopped", waitingOn: null },
    });
    emit("agent.updated", { agentId: AGENT, patch: { status: ok ? "done" : "issue", summary } });
    emit("run.plan_updated", { plan: plan("done", "done") });
    emit("run.finished", { status: ok ? "done" : "failed", summary });
  }

  const done = run().catch((err) => {
    emit("run.finished", { status: "failed", summary: errorText(err) });
  });

  return {
    events: () => [...log],
    done,
    stop() {
      stopped = true;
      for (const [, answer] of waiting) answer(false);
      waiting.clear();
      nudge();
    },
    send(command) {
      switch (command.type) {
        case "run.pause":
          if (paused) return;
          paused = true;
          emit("run.updated", { patch: { status: "paused" } });
          break;
        case "run.resume":
          if (!paused) return;
          paused = false;
          emit("run.updated", { patch: { status: waiting.size ? "needs_human" : "running" } });
          nudge();
          break;
        case "human.respond": {
          const answer = waiting.get(command.requestId);
          if (!answer) return;
          waiting.delete(command.requestId);
          emit("human.responded", { requestId: command.requestId, response: command.response });
          message(HUMAN, WORKER, "reply", command.response);
          answer(command.response === "Approved");
          break;
        }
      }
    },
  };
}

const now = () => new Date().toISOString();

function errorText(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected.";
  if (err instanceof Anthropic.RateLimitError) return "Still rate limited after retries. Try again later.";
  if (err instanceof Anthropic.APIError) return `The API returned an error: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}

function str(input: unknown, key: string): string {
  const value = (input as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : "";
}

/** What the worker is doing, for its activity line. */
function doingText(name: string, input: unknown): string {
  switch (name) {
    case "read_file":
      return `Reading ${str(input, "path")}`;
    case "list_files":
      return `Listing ${str(input, "path") || "."}`;
    case "search":
      return `Searching for ${str(input, "pattern")}`;
    case "edit_file":
      return `${str(input, "old_string") ? "Editing" : "Creating"} ${str(input, "path")}`;
    case "run_command":
      return `Running ${str(input, "command")}`;
    default:
      return name;
  }
}

/** The question on an approval card. */
function askText(name: string, input: unknown): string {
  switch (name) {
    case "run_command":
      return `Run \`${str(input, "command")}\`?`;
    case "edit_file":
      return `${str(input, "old_string") ? "Edit" : "Create"} ${str(input, "path")}?`;
    default:
      return `Allow ${name}?`;
  }
}
