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
  { label: "Prompt", color: "var(--color-primary)", dash: "5 4" },
  { label: "Reply", color: "var(--color-success)", dash: "5 4" },
  { label: "Waiting on an answer", color: "var(--color-warning)", dash: "2 4" },
  { label: "Issue found", color: "var(--color-destructive)", dash: "5 4" },
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
    <main className="flex min-w-0 flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-x-7 gap-y-4">
        <div className="min-w-0 flex-[1_1_340px]">
          <span className="eyebrow">
            {subs.length} sub-agents · {AGENT_STATUS_LABEL[agent.status]}
          </span>
          <h1 className="my-1.5 font-display text-[clamp(30px,3.4vw,44px)] leading-none font-[750] tracking-[-0.03em] text-balance">
            {agent.name}
          </h1>
          <p className="max-w-[62ch] text-muted-foreground">{agent.mission}</p>
        </div>
        <dl className="flex gap-6 max-[520px]:gap-4 [&_dd]:font-mono [&_dd]:text-xl [&_dd]:leading-none [&_dd]:font-medium [&_dd]:tabular-nums max-[520px]:[&_dd]:text-[17px] [&_dt]:font-mono [&_dt]:text-[10.5px] [&_dt]:leading-none [&_dt]:font-medium [&_dt]:tracking-[0.1em] [&_dt]:text-faint [&_dt]:uppercase [&>div]:flex [&>div]:flex-col [&>div]:gap-[5px]">
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

      <div className="flex flex-wrap gap-x-[18px] gap-y-2 text-xs text-muted-foreground" aria-label="Legend">
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-[7px]">
            <svg viewBox="0 0 26 6" aria-hidden="true" className="h-1.5 w-[26px]">
              <line x1="1" y1="3" x2="25" y2="3" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} />
            </svg>
            {item.label}
          </span>
        ))}
        <span className="text-faint">Click a sub-agent to trace its messages</span>
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
