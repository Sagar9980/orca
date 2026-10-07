import { useState } from "react";
import type { HumanRequest } from "@orca/shared";
import { SUB_STATE_LABEL } from "../lib/labels";
import { Inbox, type CardCommon } from "./SubAgentCard";

interface Props extends CardCommon {
  /** This team's requests, oldest first. */
  requests: HumanRequest[];
  askerName: (id: string) => string;
  onRespond: (requestId: string, response: string) => void;
}

/** "You" on the board: shows what the team needs from the human and takes the answer. */
export function HumanCard({ requests, askerName, onRespond, sending, inbox, focus, onToggleFocus, cardRef }: Props) {
  const open = requests.find((r) => r.status === "open");
  const last = [...requests].reverse().find((r) => r.status === "resolved");
  const state = sending ? "sending" : open ? "needs_human" : "done";

  return (
    <article
      ref={cardRef}
      className={`card card-human${focus ? ` is-${focus}` : ""}`}
      data-state={state}
      tabIndex={0}
      aria-label={open ? `You: ${open.prompt}` : "You"}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest(".answer")) onToggleFocus();
      }}
    >
      <header className="c-head">
        <span className="av">YOU</span>
        <span className="c-title">
          <h3>You</h3>
          <span className="role">{open ? `Asked by ${askerName(open.from)}` : "Human step"}</span>
        </span>
        <span className="chip">{SUB_STATE_LABEL[state]}</span>
      </header>
      {open ? (
        <>
          <p className="line line-open">{open.prompt}</p>
          <Answer key={open.id} request={open} onRespond={onRespond} />
        </>
      ) : (
        <>
          <p className="line">{last ? `You answered: ${last.response}` : "Nothing needed right now"}</p>
          <footer className="c-foot">
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
      <div className="answer">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={option === request.recommended ? "ans primary" : "ans"}
            onClick={() => respond(option)}
          >
            {option}
            {option === request.recommended && <span className="rec">Recommended</span>}
          </button>
        ))}
      </div>
    );
  }

  if (request.type === "approval") {
    return (
      <div className="answer">
        <button type="button" className="ans primary" onClick={() => respond("Approved")}>
          Approve
        </button>
        <button type="button" className="ans" onClick={() => respond("Declined")}>
          Decline
        </button>
      </div>
    );
  }

  if (request.type === "information") {
    return (
      <form
        className="answer answer-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) respond(text.trim());
        }}
      >
        <label className="sr-only" htmlFor={`human-answer-${request.id}`}>
          Your answer
        </label>
        <input
          id={`human-answer-${request.id}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your answer"
        />
        <button type="submit" className="ans primary" disabled={!text.trim()}>
          Send
        </button>
      </form>
    );
  }

  // credential: the human acts elsewhere (a browser login) and confirms here.
  return (
    <div className="answer">
      <button type="button" className="ans primary" onClick={() => respond("Done. Logged in.")}>
        I’ve done it, continue
      </button>
    </div>
  );
}
