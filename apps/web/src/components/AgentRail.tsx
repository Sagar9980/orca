import { openHumanRequests, teamOf, type RunState } from "@orca/shared";
import { AGENT_STATUS_LABEL } from "../lib/labels";

interface Props {
  state: RunState;
  selectedId: string | undefined;
  onSelect: (agentId: string) => void;
}

const WAVE_BARS = Array.from({ length: 16 }, (_, i) => i);

export function AgentRail({ state, selectedId, onSelect }: Props) {
  const agents = Object.values(state.agents);
  const requests = openHumanRequests(state);
  const first = requests[0];
  const running = agents.filter((a) => a.status !== "done" && a.status !== "queued").length;

  return (
    <aside className="rail">
      <section className="brain" aria-label="Orchestrator">
        <div className="brain-top">
          <h2>Orchestrator</h2>
          <span className="eyebrow">Plan</span>
        </div>
        <ol className="steps">
          {state.run.plan.map((step) => (
            <li key={step.id} className={step.status === "active" ? "now" : step.status}>
              {step.label}
            </li>
          ))}
        </ol>
        {first && (
          <button className="ask" type="button" onClick={() => onSelect(first.agentId)}>
            <span className="dot" />
            <span>
              <strong>
                {requests.length} {requests.length === 1 ? "step needs" : "steps need"} you
              </strong>
              <span>
                {state.agents[first.agentId]?.name}: {first.type === "decision" ? "a decision" : `a ${first.type} step`}
              </span>
            </span>
          </button>
        )}
        {state.run.summary && <p className="brain-summary">{state.run.summary}</p>}
      </section>

      <div className="rail-head">
        <span className="eyebrow">Main agents</span>
        <span className="eyebrow">{running} running</span>
      </div>
      <ul className="agents">
        {agents.map((agent) => (
          <li key={agent.id}>
            <button
              className="agent"
              type="button"
              data-status={agent.status}
              aria-pressed={agent.id === selectedId}
              onClick={() => onSelect(agent.id)}
            >
              <span className="badge">{agent.name.slice(0, 2).toUpperCase()}</span>
              <span className="a-main">
                <span className="a-name">{agent.name}</span>
                <span className="a-sub">{agent.summary}</span>
              </span>
              <span className="pill">{AGENT_STATUS_LABEL[agent.status]}</span>
              <span className="wave" aria-hidden="true">
                {WAVE_BARS.map((i) => (
                  <i key={i} />
                ))}
              </span>
              <span className="a-count">{teamOf(state, agent.id).length} sub-agents</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
