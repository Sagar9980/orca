import { useMemo, useState } from "react";
import { teamOf, type Agent, type RunState } from "@orca/shared";
import { AGENT_STATUS_LABEL, formatTokens } from "../lib/labels";
import { Board } from "./Board";
import { Comms } from "./Comms";

interface Props {
  state: RunState;
  agent: Agent;
  paused: boolean;
  onRespond: (requestId: string, response: string) => void;
}

const LEGEND = [
  { label: "Prompt", color: "var(--accent)", dash: "5 4" },
  { label: "Reply", color: "var(--mint)", dash: "5 4" },
  { label: "Waiting on an answer", color: "var(--amber)", dash: "2 4" },
  { label: "Issue found", color: "var(--coral)", dash: "5 4" },
];

export function Stage({ state, agent, paused, onRespond }: Props) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const subs = teamOf(state, agent.id);
  const messages = useMemo(
    () => state.messages.filter((m) => m.agentId === agent.id),
    [state.messages, agent.id],
  );
  const tokens = subs.reduce((n, s) => n + s.tokens, 0);

  return (
    <main className="stage">
      <div className="st-head">
        <div className="st-title">
          <span className="eyebrow">
            {subs.length} sub-agents · {AGENT_STATUS_LABEL[agent.status]}
          </span>
          <h1>{agent.name}</h1>
          <p>{agent.mission}</p>
        </div>
        <dl className="stats">
          <div>
            <dt>Sub-agents</dt>
            <dd>{subs.length}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{messages.length}</dd>
          </div>
          <div>
            <dt>Tokens</dt>
            <dd>{formatTokens(tokens)}</dd>
          </div>
        </dl>
      </div>

      <div className="legend" aria-label="Legend">
        {LEGEND.map((item) => (
          <span key={item.label}>
            <svg viewBox="0 0 26 6" aria-hidden="true">
              <line x1="1" y1="3" x2="25" y2="3" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} />
            </svg>
            {item.label}
          </span>
        ))}
        <span className="legend-hint">Click a sub-agent to trace its messages</span>
      </div>

      <Board
        state={state}
        agentId={agent.id}
        messages={messages}
        focusId={focusId}
        onToggleFocus={(id) => setFocusId((cur) => (cur === id ? null : id))}
        paused={paused}
        onRespond={onRespond}
      />

      <Comms state={state} messages={messages} focusId={focusId} onClearFocus={() => setFocusId(null)} />
    </main>
  );
}
