import type { RunEvent } from "./events.js";
import type { Agent, HumanRequest, Message, Run, SubAgent } from "./model.js";

/** The full state of one run, rebuilt from its events. */
export interface RunState {
  run: Run;
  agents: Record<string, Agent>;
  subAgents: Record<string, SubAgent>;
  messages: Message[];
  humanRequests: Record<string, HumanRequest>;
  lastSeq: number;
}

/**
 * Applies one event and returns a new state. Pure: the input state is never
 * mutated. Events at or below lastSeq are ignored, so replays are safe.
 * Returns undefined until a "run.started" event has been seen.
 */
export function applyEvent(state: RunState | undefined, event: RunEvent): RunState | undefined {
  if (event.type === "run.started") {
    if (state && event.seq <= state.lastSeq) return state;
    return {
      run: event.run,
      agents: {},
      subAgents: {},
      messages: [],
      humanRequests: {},
      lastSeq: event.seq,
    };
  }
  if (!state || event.seq <= state.lastSeq) return state;
  const next: RunState = { ...state, lastSeq: event.seq };

  switch (event.type) {
    case "run.updated":
      next.run = { ...state.run, ...event.patch };
      break;
    case "run.plan_updated":
      next.run = { ...state.run, plan: event.plan };
      break;
    case "run.spend":
      next.run = { ...state.run, budget: { ...state.run.budget, spentUsd: event.spentUsd } };
      break;
    case "run.finished":
      next.run = { ...state.run, status: event.status, summary: event.summary, finishedAt: event.at };
      break;
    case "agent.spawned":
      next.agents = { ...state.agents, [event.agent.id]: event.agent };
      break;
    case "agent.updated": {
      const agent = state.agents[event.agentId];
      if (agent) next.agents = { ...state.agents, [agent.id]: { ...agent, ...event.patch } };
      break;
    }
    case "subagent.spawned":
      next.subAgents = { ...state.subAgents, [event.subAgent.id]: event.subAgent };
      break;
    case "subagent.updated": {
      const sub = state.subAgents[event.subAgentId];
      if (sub) next.subAgents = { ...state.subAgents, [sub.id]: { ...sub, ...event.patch } };
      break;
    }
    case "message.sent":
      next.messages = [...state.messages, event.message];
      break;
    case "human.requested":
      next.humanRequests = { ...state.humanRequests, [event.request.id]: event.request };
      break;
    case "human.responded": {
      const req = state.humanRequests[event.requestId];
      if (req) {
        next.humanRequests = {
          ...state.humanRequests,
          [req.id]: { ...req, status: "resolved", response: event.response },
        };
      }
      break;
    }
  }
  return next;
}

/** Rebuilds a run's state from a list of events. */
export function replay(events: Iterable<RunEvent>): RunState | undefined {
  let state: RunState | undefined;
  for (const event of events) state = applyEvent(state, event);
  return state;
}

/** Sub-agents in one main agent's team, in spawn order. */
export function teamOf(state: RunState, agentId: string): SubAgent[] {
  return Object.values(state.subAgents).filter((s) => s.agentId === agentId);
}

/** Open human requests across the run, oldest first. */
export function openHumanRequests(state: RunState): HumanRequest[] {
  return Object.values(state.humanRequests).filter((r) => r.status === "open");
}
