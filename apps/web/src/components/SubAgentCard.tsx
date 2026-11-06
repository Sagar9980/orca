import type { Message, SubAgent, SubAgentState } from "@orca/shared";
import { formatTokens, initials, SUB_STATE_LABEL } from "../lib/labels";
import { KIND_TONE, SUB_TONE } from "../lib/tones";
import { cn } from "../lib/utils";
import { Typewriter } from "./Typewriter";
import { Badge } from "./ui/badge";

export interface CardCommon {
  sending: boolean;
  inbox: { message: Message; fromName: string } | undefined;
  focus: "focus" | "near" | "dim" | null;
  onToggleFocus: () => void;
  cardRef: (el: HTMLElement | null) => void;
}

export type CardState = SubAgentState | "sending";

const MINI_BARS = [0, 1, 2, 3];

/** How a card's frame shows its state; the colors inside come from its tone. */
const FRAME: Record<CardState, string> = {
  idle: "hover:border-border-strong",
  done: "hover:border-border-strong",
  working: "border-[color-mix(in_oklab,var(--color-primary)_35%,var(--color-border))]",
  sending:
    "border-primary shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_16%,transparent),0_14px_34px_-18px_var(--color-primary)]",
  waiting: "border-dashed border-warning/70",
  needs_human:
    "border-warning bg-[color-mix(in_oklab,var(--color-warning)_9%,var(--color-card))] shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-warning)_15%,transparent)]",
  issue: "border-destructive/70",
};

/** States in which the card is busy: its avatar pings and its bars move. */
const busy = (state: CardState) => state === "working" || state === "sending" || state === "needs_human";

/** The frame of a card on the board, shared by sub-agents and "You". */
export function cardClass(state: CardState, focus: CardCommon["focus"]) {
  return cn(
    SUB_TONE[state],
    "relative flex cursor-pointer flex-col gap-2.5 rounded-[15px] border bg-card px-3.5 pt-3.5 pb-3 transition-[border-color,box-shadow,opacity] duration-250",
    FRAME[state],
    focus === "dim" && "opacity-38",
  );
}

/** The card's header: avatar, name and role, state. */
export function CardHead({
  state,
  avatar,
  name,
  role,
  square,
}: {
  state: CardState;
  avatar: string;
  name: string;
  role: string;
  square?: boolean;
}) {
  return (
    <header className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          "relative grid size-[34px] flex-none place-items-center rounded-full border border-(--tone)/40 bg-[color-mix(in_oklab,var(--tone)_15%,var(--color-card))] font-mono text-[11px] leading-none font-semibold text-(--tone)",
          "after:absolute after:-inset-px after:rounded-[inherit] after:border-[1.5px] after:border-(--tone) after:opacity-0",
          square && "rounded-[10px]",
          busy(state) && "after:animate-ring",
        )}
      >
        {avatar}
      </span>
      <span className="min-w-0 flex-1">
        <h3 className="truncate text-sm leading-[1.2] font-[650]">{name}</h3>
        <span className="block truncate text-[11.5px] text-muted-foreground">{role}</span>
      </span>
      <Badge tone={SUB_TONE[state]}>{SUB_STATE_LABEL[state]}</Badge>
    </header>
  );
}

/** The card's current line: two lines of mono text, or `open` for a longer question in body text. */
export const cardLine = (state: CardState, open?: boolean) =>
  cn(
    "line-clamp-2 min-h-[2.9em] font-mono text-[12.5px] leading-[1.45] wrap-anywhere text-foreground",
    open && "line-clamp-4 font-sans text-[13px]",
    (state === "idle" || state === "done") && "text-muted-foreground",
  );

export const cardFoot =
  "flex min-h-[30px] items-center justify-between gap-2 border-t pt-[9px] font-mono text-[11px] leading-none text-faint tabular-nums";

export function SubAgentCard({ sub, sending, inbox, focus, onToggleFocus, cardRef }: CardCommon & { sub: SubAgent }) {
  const shown: CardState = sending ? "sending" : sub.state;
  const typing = shown === "working" || shown === "sending";
  return (
    <article
      ref={cardRef}
      className={cardClass(shown, focus)}
      tabIndex={0}
      aria-label={`${sub.name}, ${sub.role}, ${SUB_STATE_LABEL[shown]}`}
      onClick={onToggleFocus}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleFocus();
        }
      }}
    >
      <CardHead state={shown} avatar={initials(sub.name)} name={sub.name} role={sub.role} />
      <p className={cardLine(shown)}>
        <Typewriter text={sub.activity} />
        {typing && <span className="ml-[3px] inline-block h-[13px] w-[7px] animate-blink bg-(--tone) align-[-2px]" />}
      </p>
      <footer className={cardFoot}>
        <span>{formatTokens(sub.tokens)} tokens</span>
        <span
          className={cn(
            "bars flex h-3 items-end gap-0.5 [&>i]:h-[30%] [&>i]:w-[3px] [&>i]:opacity-50",
            typing && "is-active",
          )}
          aria-hidden="true"
        >
          {MINI_BARS.map((i) => (
            <i key={i} />
          ))}
        </span>
      </footer>
      <Inbox inbox={inbox} />
    </article>
  );
}

/** A message that just arrived, shown over the bottom of the card for a moment. */
export function Inbox({ inbox }: { inbox: CardCommon["inbox"] }) {
  return (
    <div
      className={cn(
        KIND_TONE[inbox?.message.kind ?? "prompt"],
        "pointer-events-none absolute inset-x-2.5 bottom-2.5 translate-y-2 rounded-lg border border-(--tone)/55 bg-[color-mix(in_oklab,var(--tone)_13%,var(--color-card))] px-2.5 py-2 text-xs leading-[1.35] opacity-0 transition-[opacity,transform] duration-300",
        inbox && "translate-y-0 opacity-100",
      )}
      aria-hidden={!inbox}
    >
      <span className="mb-1 block font-mono text-[9.5px] leading-none font-medium tracking-[0.09em] text-(--tone) uppercase">
        From {inbox?.fromName}
      </span>
      <q className="line-clamp-2 [quotes:none]">{inbox?.message.text}</q>
    </div>
  );
}
