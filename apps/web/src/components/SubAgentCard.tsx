import type { Message, SubAgent } from "@orca/shared";
import { formatTokens, initials, SUB_STATE_LABEL } from "../lib/labels";
import { Typewriter } from "./Typewriter";

export interface CardCommon {
  sending: boolean;
  inbox: { message: Message; fromName: string } | undefined;
  focus: "focus" | "near" | "dim" | null;
  onToggleFocus: () => void;
  cardRef: (el: HTMLElement | null) => void;
}

const MINI_BARS = [0, 1, 2, 3];

export function SubAgentCard({ sub, sending, inbox, focus, onToggleFocus, cardRef }: CardCommon & { sub: SubAgent }) {
  const shown = sending ? "sending" : sub.state;
  return (
    <article
      ref={cardRef}
      className={`card${focus ? ` is-${focus}` : ""}`}
      data-state={shown}
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
      <header className="c-head">
        <span className="av">{initials(sub.name)}</span>
        <span className="c-title">
          <h3>{sub.name}</h3>
          <span className="role">{sub.role}</span>
        </span>
        <span className="chip">{SUB_STATE_LABEL[shown]}</span>
      </header>
      <p className="line">
        <Typewriter text={sub.activity} />
        <span className="caret" />
      </p>
      <footer className="c-foot">
        <span>{formatTokens(sub.tokens)} tokens</span>
        <span className="mini" aria-hidden="true">
          {MINI_BARS.map((i) => (
            <i key={i} />
          ))}
        </span>
      </footer>
      <Inbox inbox={inbox} />
    </article>
  );
}

export function Inbox({ inbox }: { inbox: CardCommon["inbox"] }) {
  return (
    <div className={`inbox k-${inbox?.message.kind ?? "prompt"}${inbox ? " show" : ""}`} aria-hidden={!inbox}>
      <span className="from">From {inbox?.fromName}</span>
      <q>{inbox?.message.text}</q>
    </div>
  );
}
