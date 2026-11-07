import type { AgentStatus, MessageKind, RunStatus, SubAgentState } from "@orca/shared";

/** Classes that set --tone (see index.css), which badges, dots, wires and cards color themselves with. */
export type ToneClass = "tone-primary" | "tone-success" | "tone-warning" | "tone-destructive" | "tone-muted" | "tone-faint";

export const AGENT_TONE: Record<AgentStatus, ToneClass> = {
  queued: "tone-faint",
  working: "tone-primary",
  needs_human: "tone-warning",
  issue: "tone-destructive",
  done: "tone-success",
};

export const SUB_TONE: Record<SubAgentState | "sending", ToneClass> = {
  idle: "tone-faint",
  working: "tone-primary",
  sending: "tone-primary",
  waiting: "tone-warning",
  needs_human: "tone-warning",
  issue: "tone-destructive",
  done: "tone-success",
};

export const KIND_TONE: Record<MessageKind, ToneClass> = {
  prompt: "tone-primary",
  reply: "tone-success",
  question: "tone-warning",
  issue: "tone-destructive",
};

export const RUN_TONE: Record<RunStatus, ToneClass> = {
  planning: "tone-primary",
  running: "tone-primary",
  needs_human: "tone-warning",
  paused: "tone-muted",
  done: "tone-success",
  failed: "tone-destructive",
};
