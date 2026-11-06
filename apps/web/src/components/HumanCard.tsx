import { useState } from "react";
import type { HumanRequest } from "@orca/shared";
import { SUB_STATE_LABEL } from "../lib/labels";
import { cn } from "../lib/utils";
import { CardHead, cardClass, cardFoot, cardLine, Inbox, type CardCommon, type CardState } from "./SubAgentCard";
import { Input } from "./ui/input";

interface Props extends CardCommon {
  /** This team's requests, oldest first. */
  requests: HumanRequest[];
  askerName: (id: string) => string;
  onRespond: (requestId: string, response: string) => void;
}

/** An answer button; the recommended (or only sensible) one is filled. */
const answer = (primary?: boolean) =>
  cn(
    "flex min-h-8 items-center justify-between gap-2 rounded-md border border-warning/50 px-2.5 py-1.5 text-left text-[12.5px] font-semibold hover:border-warning",
    primary && "border-warning bg-warning text-card",
  );

/** "You" on the board: shows what the team needs from the human and takes the answer. */
export function HumanCard({ requests, askerName, onRespond, sending, inbox, focus, onToggleFocus, cardRef }: Props) {
  const open = requests.find((r) => r.status === "open");
  const last = [...requests].reverse().find((r) => r.status === "resolved");
  const state: CardState = sending ? "sending" : open ? "needs_human" : "done";

  return (
    <article
      ref={cardRef}
      className={cardClass(state, focus)}
      tabIndex={0}
      aria-label={open ? `You: ${open.prompt}` : "You"}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("[data-answer]")) onToggleFocus();
      }}
    >
      <CardHead
        state={state}
        avatar="YOU"
        name="You"
        role={open ? `Asked by ${askerName(open.from)}` : "Human step"}
        square
      />
      {open ? (
        <>
          <p className={cardLine(state, true)}>{open.prompt}</p>
          <Answer key={open.id} request={open} onRespond={onRespond} />
        </>
      ) : (
        <>
          <p className={cardLine(state)}>{last ? `You answered: ${last.response}` : "Nothing needed right now"}</p>
          <footer className={cardFoot}>
            <span>{requests.length} answered</span>
          </footer>
        </>
      )}
      {!open && <Inbox inbox={inbox} />}
    </article>
  );
}

function Answer({ request, onRespond }: { request: HumanRequest; onRespond: Props["onRespond"] }) {
  const [text, setText] = useState("");
  const respond = (response: string) => onRespond(request.id, response);

  if (request.type === "decision" && request.options?.length) {
    const options = [...request.options].sort((a, b) =>
      a === request.recommended ? -1 : b === request.recommended ? 1 : 0,
    );
    return (
      <div data-answer className="flex cursor-default flex-col gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={answer(option === request.recommended)}
            onClick={() => respond(option)}
          >
            {option}
            {option === request.recommended && (
              <span className="font-mono text-[9px] leading-none font-medium tracking-[0.08em] uppercase opacity-85">
                Recommended
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (request.type === "approval") {
    return (
      <div data-answer className="flex cursor-default flex-col gap-1.5">
        <button type="button" className={answer(true)} onClick={() => respond("Approved")}>
          Approve
        </button>
        <button type="button" className={answer()} onClick={() => respond("Declined")}>
          Decline
        </button>
      </div>
    );
  }

  if (request.type === "information") {
    return (
      <form
        data-answer
        className="flex cursor-default flex-row gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) respond(text.trim());
        }}
      >
        <label className="sr-only" htmlFor={`human-answer-${request.id}`}>
          Your answer
        </label>
        <Input
          className="h-8 flex-1 rounded-md px-2.5 text-sm"
          id={`human-answer-${request.id}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your answer"
        />
        <button type="submit" className={answer(true)} disabled={!text.trim()}>
          Send
        </button>
      </form>
    );
  }

  // credential: the human acts elsewhere (a browser login) and confirms here.
  return (
    <div data-answer className="flex cursor-default flex-col gap-1.5">
      <button type="button" className={answer(true)} onClick={() => respond("Done. Logged in.")}>
        I’ve done it, continue
      </button>
    </div>
  );
}
