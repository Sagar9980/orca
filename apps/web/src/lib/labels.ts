import { HUMAN, ORCHESTRATOR, type AgentStatus, type MessageKind, type RunState, type SubAgentState } from "@orca/shared";

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  queued: "Queued",
  working: "Working",
  needs_human: "Needs you",
  issue: "Issue",
  done: "Done",
};

export const SUB_STATE_LABEL: Record<SubAgentState | "sending", string> = {
  idle: "Idle",
  working: "Working",
  sending: "Sending",
  waiting: "Waiting",
  needs_human: "Needs you",
  issue: "Issue",
  done: "Done",
};

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
  prompt: "Prompt",
  reply: "Reply",
  question: "Question",
  issue: "Issue",
};

export function participantName(state: RunState, id: string): string {
  if (id === HUMAN) return "You";
  if (id === ORCHESTRATOR) return "Orca";
  return state.subAgents[id]?.name ?? id;
}

export function initials(name: string): string {
  if (name === "You") return "YOU";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const formatClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export const formatTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Stable key for the wire between two participants. */
export const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
