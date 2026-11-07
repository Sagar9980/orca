import type { Message, RunState } from "@orca/shared";
import { formatClock, MESSAGE_KIND_LABEL, participantName } from "../lib/labels";
import { KIND_TONE } from "../lib/tones";
import { cn } from "../lib/utils";
import { ArrowIcon } from "./icons";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

interface Props {
  state: RunState;
  messages: Message[];
  focusId: string | null;
  onClearFocus: () => void;
}

const MAX_ROWS = 40;

export function Comms({ state, messages, focusId, onClearFocus }: Props) {
  const start = Date.parse(state.run.startedAt);
  const rows = messages
    .filter((m) => !focusId || m.from === focusId || m.to === focusId)
    .slice(-MAX_ROWS)
    .reverse();

  return (
    <section className="overflow-hidden rounded-2xl border bg-panel" aria-label="Comms log">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="font-display text-[15px] leading-none font-bold">Comms</h2>
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <span>{focusId ? `Messages to and from ${participantName(state, focusId)}` : "All messages in this team"}</span>
          {focusId && (
            <Button variant="link" onClick={onClearFocus}>
              Show all
            </Button>
          )}
        </div>
      </div>
      <ul className="max-h-[290px] overflow-y-auto py-1.5">
        {rows.length === 0 && (
          <li className="px-4 py-[9px] text-muted-foreground">
            <p>No messages yet. They appear here as sub-agents talk to each other.</p>
          </li>
        )}
        {rows.map((m) => (
          <li
            key={m.id}
            className={cn(
              KIND_TONE[m.kind],
              "grid animate-flash grid-cols-[52px_minmax(0,1fr)] gap-3 px-4 py-[9px] [&+&]:border-t [&+&]:border-border/60",
            )}
          >
            <time className="font-mono text-[11.5px] leading-[1.7] text-faint tabular-nums">
              {formatClock(Date.parse(m.at) - start)}
            </time>
            <div>
              <div className="flex flex-wrap items-center gap-1.5 text-[13px] [&_b]:font-semibold [&_svg]:h-2.5 [&_svg]:w-3.5 [&_svg]:text-faint">
                <b>{participantName(state, m.from)}</b>
                <ArrowIcon />
                <b>{participantName(state, m.to)}</b>
                <Badge tone={KIND_TONE[m.kind]} className="ml-1 px-1.5 py-[3px]">
                  {MESSAGE_KIND_LABEL[m.kind]}
                </Badge>
              </div>
              <p className="mt-[3px] text-[13px] wrap-anywhere text-muted-foreground">{m.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
