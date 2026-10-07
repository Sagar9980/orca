import type {
  Agent,
  AgentStatus,
  HumanRequest,
  Message,
  PlanStep,
  Run,
  RunStatus,
  SubAgent,
} from "./model.js";

// Everything that happens in a run is an event. The server streams them in
// order, and any client can rebuild the full run state by replaying them.

type EventOf<T extends string, P> = {
  type: T;
  runId: string;
  /** Increases by one per event within a run. Used to drop duplicates on reconnect. */
  seq: number;
  at: string;
} & P;

export type RunEvent =
  | EventOf<"run.started", { run: Run }>
  | EventOf<"run.updated", { patch: Partial<Pick<Run, "status" | "title" | "detail">> }>
  | EventOf<"run.plan_updated", { plan: PlanStep[] }>
  | EventOf<"run.spend", { spentUsd: number }>
  | EventOf<"run.finished", { status: Extract<RunStatus, "done" | "failed">; summary: string }>
  | EventOf<"agent.spawned", { agent: Agent }>
  | EventOf<"agent.updated", { agentId: string; patch: { status?: AgentStatus; summary?: string } }>
  | EventOf<"subagent.spawned", { subAgent: SubAgent }>
  | EventOf<
      "subagent.updated",
      { subAgentId: string; patch: Partial<Pick<SubAgent, "state" | "activity" | "waitingOn" | "tokens">> }
    >
  | EventOf<"message.sent", { message: Message }>
  | EventOf<"human.requested", { request: HumanRequest }>
  | EventOf<"human.responded", { requestId: string; response: string }>;

export type RunEventType = RunEvent["type"];

/** Commands a client sends to the server. */
export type ClientCommand =
  | { type: "run.create"; idea: string }
  | { type: "run.pause"; runId: string }
  | { type: "run.resume"; runId: string }
  | { type: "human.respond"; runId: string; requestId: string; response: string };
