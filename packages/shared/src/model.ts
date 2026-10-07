// Core entities of an Orca run. A run has main agents (Builder, Tester, ...),
// and each main agent has a team of sub-agents that message each other.

/** Reserved participant ids that are not sub-agents. */
export const ORCHESTRATOR = "orchestrator";
export const HUMAN = "human";

/** A sub-agent id, or one of the reserved ids above. */
export type ParticipantId = string;

export type RunStatus = "planning" | "running" | "paused" | "needs_human" | "done" | "failed";

export type PlanStepStatus = "pending" | "active" | "done";

export interface PlanStep {
  id: string;
  label: string;
  status: PlanStepStatus;
}

export interface Budget {
  limitUsd: number;
  spentUsd: number;
}

export interface Run {
  id: string;
  /** The user's idea, in their own words. */
  title: string;
  /** Short context shown next to the title, e.g. "Stripe, test mode". */
  detail?: string;
  status: RunStatus;
  plan: PlanStep[];
  budget: Budget;
  /** ISO 8601 timestamp. */
  startedAt: string;
  finishedAt?: string;
  summary?: string;
}

export type AgentStatus = "queued" | "working" | "needs_human" | "issue" | "done";

/** A main agent spawned by the orchestrator. */
export interface Agent {
  id: string;
  runId: string;
  name: string;
  /** What this agent is responsible for in this run. */
  mission: string;
  status: AgentStatus;
  /** One-line description of what it is doing right now. */
  summary: string;
}

export type SubAgentState = "idle" | "working" | "waiting" | "needs_human" | "issue" | "done";

/** A worker inside a main agent's team. */
export interface SubAgent {
  id: string;
  agentId: string;
  name: string;
  /** Short description of its job, e.g. "Database models". */
  role: string;
  state: SubAgentState;
  /** The line it is working on right now. */
  activity: string;
  /** Who it is blocked on while state is "waiting" or "needs_human". Null so it survives JSON. */
  waitingOn: ParticipantId | null;
  tokens: number;
}

export type MessageKind = "prompt" | "reply" | "question" | "issue";

export interface Message {
  id: string;
  runId: string;
  /** The team this message belongs to. */
  agentId: string;
  from: ParticipantId;
  to: ParticipantId;
  kind: MessageKind;
  text: string;
  at: string;
}

/** The four kinds of human-only blockers from the README (section 4.3). */
export type HumanRequestType = "decision" | "credential" | "approval" | "information";

export interface HumanRequest {
  id: string;
  runId: string;
  agentId: string;
  /** The sub-agent that is blocked. */
  from: ParticipantId;
  type: HumanRequestType;
  prompt: string;
  /** Choices for a "decision" request. */
  options?: string[];
  /** The option Orca recommends, so the human can just confirm. */
  recommended?: string;
  status: "open" | "resolved";
  response?: string;
  at: string;
}
