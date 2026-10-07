import type { Message, RunState } from "@orca/shared";
import { formatClock, MESSAGE_KIND_LABEL, participantName } from "../lib/labels";
import { ArrowIcon } from "./icons";

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
    <section className="comms" aria-label="Comms log">
      <div className="comms-head">
        <h2>Comms</h2>
        <div className="filter">
          <span>{focusId ? `Messages to and from ${participantName(state, focusId)}` : "All messages in this team"}</span>
          {focusId && (
            <button className="linkbtn" type="button" onClick={onClearFocus}>
              Show all
            </button>
          )}
        </div>
      </div>
      <ul className="feed">
        {rows.length === 0 && (
          <li className="f-item f-empty">
            <p>No messages yet. They appear here as sub-agents talk to each other.</p>
          </li>
        )}
        {rows.map((m) => (
          <li key={m.id} className={`f-item k-${m.kind}`}>
            <time>{formatClock(Date.parse(m.at) - start)}</time>
            <div>
              <div className="f-route">
                <b>{participantName(state, m.from)}</b>
                <ArrowIcon />
                <b>{participantName(state, m.to)}</b>
                <span className="k">{MESSAGE_KIND_LABEL[m.kind]}</span>
              </div>
              <p>{m.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
