import { openHumanRequests, teamOf, type PlanStepStatus, type RunState } from "@orca/shared";
import { AGENT_STATUS_LABEL } from "../lib/labels";
import { AGENT_TONE } from "../lib/tones";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";

interface Props {
  state: RunState;
  selectedId: string | undefined;
  onSelect: (agentId: string) => void;
}

const WAVE_BARS = Array.from({ length: 16 }, (_, i) => i);

/** Plan steps: a short bar over each label; the active one fills back and forth. */
const STEP: Record<PlanStepStatus, string> = {
  pending: "text-faint",
  done: "text-muted-foreground before:bg-primary/55",
  active:
    "text-primary before:animate-fill before:bg-[linear-gradient(90deg,var(--color-primary)_50%,var(--color-border)_50%)] before:bg-size-[200%_100%]",
};

export function AgentRail({ state, selectedId, onSelect }: Props) {
  const agents = Object.values(state.agents);
  const requests = openHumanRequests(state);
  const first = requests[0];
  // Nothing runs once the run has ended, even agents it stopped mid-way.
  const running = state.run.finishedAt ? 0 : agents.filter((a) => a.status !== "done" && a.status !== "queued").length;

  return (
    <aside className="flex min-w-0 flex-col gap-5">
      <section className="flex flex-col gap-3.5 rounded-2xl border bg-panel p-4" aria-label="Orchestrator">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg leading-[1.1] font-bold tracking-[-0.01em]">Orchestrator</h2>
          <span className="eyebrow">Plan</span>
        </div>
        <ol className="grid grid-cols-3 gap-x-1.5 gap-y-2.5">
          {state.run.plan.map((step) => (
            <li
              key={step.id}
              className={cn(
                "flex min-w-0 flex-col gap-1.5 font-mono text-[9.5px] leading-none font-medium tracking-[0.06em] uppercase before:h-1 before:rounded-[2px] before:bg-border",
                STEP[step.status],
              )}
            >
              {step.label}
            </li>
          ))}
        </ol>
        {first && (
          <button
            className="flex w-full items-center gap-2.5 rounded-[11px] border border-warning/45 bg-warning/10 px-3 py-2.5 text-left"
            type="button"
            onClick={() => onSelect(first.agentId)}
          >
            <span className="size-2 flex-none animate-beacon rounded-full bg-warning" />
            <span>
              <strong className="block text-[13px]">
                {requests.length} {requests.length === 1 ? "step needs" : "steps need"} you
              </strong>
              <span className="text-xs text-muted-foreground">
                {state.agents[first.agentId]?.name}: {first.type === "decision" ? "a decision" : `a ${first.type} step`}
              </span>
            </span>
          </button>
        )}
      </section>

      <div className="flex items-baseline justify-between px-1">
        <span className="eyebrow">Main agents</span>
        <span className="eyebrow">{running} running</span>
      </div>
      <ul className="flex flex-col gap-1 max-[920px]:snap-x max-[920px]:snap-mandatory max-[920px]:flex-row max-[920px]:overflow-x-auto max-[920px]:pb-1.5">
        {agents.map((agent) => {
          const active = agent.status === "working" || agent.status === "needs_human" || agent.status === "issue";
          return (
            <li key={agent.id} className="max-[920px]:flex-[0_0_240px] max-[920px]:snap-start">
              <button
                className={cn(
                  AGENT_TONE[agent.status],
                  "group grid w-full grid-cols-[36px_minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-x-3 gap-y-[7px] rounded-[13px] border border-transparent px-3 py-2.5 text-left transition-[background-color,border-color] duration-200 hover:bg-panel max-[920px]:border-border",
                  "aria-pressed:border-border-strong aria-pressed:bg-card aria-pressed:shadow-[0_8px_28px_-18px_var(--color-primary)]",
                )}
                type="button"
                aria-pressed={agent.id === selectedId}
                onClick={() => onSelect(agent.id)}
              >
                <span className="row-span-2 grid size-9 place-items-center rounded-[10px] border bg-panel font-mono text-xs leading-none font-semibold text-(--tone) group-aria-pressed:border-(--tone)/40 group-aria-pressed:bg-[color-mix(in_oklab,var(--tone)_16%,var(--color-card))]">
                  {agent.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="text-[14.5px] leading-[1.2] font-[650]">{agent.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{agent.summary}</span>
                </span>
                <Badge tone={AGENT_TONE[agent.status]} className="text-[10px] tracking-[0.08em]">
                  {AGENT_STATUS_LABEL[agent.status]}
                </Badge>
                <span
                  className={cn(
                    "bars col-start-2 flex h-3 items-end gap-0.5 [&>i]:h-1/5 [&>i]:flex-1 [&>i]:opacity-35",
                    active && "is-active",
                  )}
                  aria-hidden="true"
                >
                  {WAVE_BARS.map((i) => (
                    <i key={i} />
                  ))}
                </span>
                <span className="col-start-3 text-right font-mono text-[11px] leading-none whitespace-nowrap text-faint">
                  {teamOf(state, agent.id).length} sub-agents
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
