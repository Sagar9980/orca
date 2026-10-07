import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HUMAN, teamOf, type Message, type MessageKind, type RunState } from "@orca/shared";
import { edgeKey, participantName } from "../lib/labels";
import { usePrefersReducedMotion } from "../lib/hooks";
import { SubAgentCard, type CardCommon } from "./SubAgentCard";
import { HumanCard } from "./HumanCard";

interface Props {
  state: RunState;
  agentId: string;
  /** This team's messages, oldest first. */
  messages: Message[];
  focusId: string | null;
  onToggleFocus: (id: string) => void;
  paused: boolean;
  onRespond: (requestId: string, response: string) => void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const PACKET_MS = 1150;
const INBOX_MS = 2900;
/** Head first, then a fading tail that trails behind it along the path. */
const PACKET_PARTS = [
  { cls: "halo", r: 12, lag: 0 },
  { cls: "t3", r: 2, lag: 0.12 },
  { cls: "t2", r: 2.6, lag: 0.08 },
  { cls: "t1", r: 3.2, lag: 0.04 },
  { cls: "core", r: 4.4, lag: 0 },
];

interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

function boxOf(el: HTMLElement, board: DOMRect): Box {
  const r = el.getBoundingClientRect();
  return { cx: r.left - board.left + r.width / 2, cy: r.top - board.top + r.height / 2, w: r.width, h: r.height };
}

/** Where the line from the box's center in direction (dx, dy) leaves the box, with a small gap. */
function exitPoint(b: Box, dx: number, dy: number): [number, number] {
  const s = Math.min((b.w / 2 + 5) / Math.max(Math.abs(dx), 1e-6), (b.h / 2 + 5) / Math.max(Math.abs(dy), 1e-6));
  return [b.cx + dx * s, b.cy + dy * s];
}

/** A gentle curve from the edge of one card to the edge of the other. */
function wirePath(a: Box, b: Box): string {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const [x1, y1] = exitPoint(a, dx, dy);
  const [x2, y2] = exitPoint(b, -dx, -dy);
  const bend = Math.min(70, len * 0.17);
  const qx = (x1 + x2) / 2 + (-dy / len) * bend;
  const qy = (y1 + y2) / 2 + (dx / len) * bend;
  const f = (n: number) => n.toFixed(1);
  return `M${f(x1)} ${f(y1)} Q${f(qx)} ${f(qy)} ${f(x2)} ${f(y2)}`;
}

function sameRecord(a: Record<string, string>, b: Record<string, string>) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** Keeps one stable callback ref per id, so refs don't detach and reattach on every render. */
function useRefMap<T extends Element>() {
  const els = useRef(new Map<string, T>());
  const callbacks = useRef(new Map<string, (el: T | null) => void>());
  const refFor = useCallback((id: string) => {
    let cb = callbacks.current.get(id);
    if (!cb) {
      cb = (el) => {
        if (el) els.current.set(id, el);
        else els.current.delete(id);
      };
      callbacks.current.set(id, cb);
    }
    return cb;
  }, []);
  return [els, refFor] as const;
}

export function Board({ state, agentId, messages, focusId, onToggleFocus, paused, onRespond }: Props) {
  const reduce = usePrefersReducedMotion();
  const subs = teamOf(state, agentId);
  const requests = Object.values(state.humanRequests).filter((r) => r.agentId === agentId);
  const hasHuman = requests.length > 0 || messages.some((m) => m.from === HUMAN || m.to === HUMAN);

  // Place "You" right after the first sub-agent that asked, so its wire stays short.
  const ids = subs.map((s) => s.id);
  if (hasHuman) {
    const at = requests[0] ? ids.indexOf(requests[0].from) : -1;
    ids.splice(at >= 0 ? at + 1 : ids.length, 0, HUMAN);
  }
  const idsKey = ids.join(",");
  const present = useMemo(() => new Set(idsKey.split(",")), [idsKey]);

  // Wires appear as soon as two participants have exchanged a message.
  const edges = useMemo(() => {
    const keys = new Set<string>();
    for (const m of messages) if (present.has(m.from) && present.has(m.to)) keys.add(edgeKey(m.from, m.to));
    return [...keys];
  }, [messages, present]);
  const edgesKey = edges.join(",");

  const boardRef = useRef<HTMLElement>(null);
  const fxRef = useRef<SVGSVGElement>(null);
  const [cardEls, cardRef] = useRefMap<HTMLElement>();
  const [pathEls, pathRef] = useRefMap<SVGPathElement>();
  const [geo, setGeo] = useState<Record<string, string>>({});

  const measure = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const b = board.getBoundingClientRect();
    const next: Record<string, string> = {};
    for (const key of edgesKey ? edgesKey.split(",") : []) {
      const [a, c] = key.split("|");
      const A = cardEls.current.get(a);
      const C = cardEls.current.get(c);
      if (A && C) next[key] = wirePath(boxOf(A, b), boxOf(C, b));
    }
    setGeo((prev) => (sameRecord(prev, next) ? prev : next));
  }, [edgesKey, cardEls]);

  useLayoutEffect(measure, [measure, idsKey]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(board);
    cardEls.current.forEach((el) => ro.observe(el));
    document.fonts?.ready.then(() => measure());
    return () => ro.disconnect();
  }, [measure, idsKey, cardEls]);

  // ---- Message animation: sender glows, a packet travels the wire, the receiver shows the message.
  const [sending, setSending] = useState<Record<string, number>>({});
  const [live, setLive] = useState<Record<string, MessageKind>>({});
  const [inbox, setInbox] = useState<Record<string, Message>>({});
  const alive = useRef(true);
  const pausedRef = useRef(paused);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      if (alive.current) fn();
    }, ms);
    timers.current.add(t);
  }, []);

  const deliver = useCallback(
    (m: Message) => {
      setInbox((prev) => ({ ...prev, [m.to]: m }));
      later(() => setInbox((prev) => {
        if (prev[m.to]?.id !== m.id) return prev;
        const { [m.to]: _gone, ...rest } = prev;
        return rest;
      }), INBOX_MS);
    },
    [later],
  );

  const animatePacket = useCallback(
    (key: string, from: string, kind: MessageKind, done: () => void) => {
      const fx = fxRef.current;
      if (!fx) return done();
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", `pk k-${kind}`);
      const parts = PACKET_PARTS.map(({ cls, r }) => {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("class", cls);
        c.setAttribute("r", String(r));
        c.setAttribute("cx", "-50");
        g.appendChild(c);
        return c;
      });
      fx.appendChild(g);
      const forward = key.split("|")[0] === from;
      let start: number | null = null;
      let last = 0;
      let waited = 0;

      const frame = (ts: number) => {
        if (!alive.current) return g.remove();
        const path = pathEls.current.get(key);
        const len = path?.getTotalLength() ?? 0;
        if (start === null) {
          // The wire for a brand-new edge gets its geometry a frame or two after the message.
          if (!len && waited++ < 30) return void requestAnimationFrame(frame);
          if (!len || !path) {
            g.remove();
            return done();
          }
          start = ts;
          last = ts;
        }
        if (pausedRef.current) start += ts - last;
        last = ts;
        const p = Math.min(1, (ts - start) / PACKET_MS);
        const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
        PACKET_PARTS.forEach(({ lag }, i) => {
          const q = Math.max(0, eased - lag);
          const pt = path!.getPointAtLength((forward ? q : 1 - q) * len);
          parts[i].setAttribute("cx", String(pt.x));
          parts[i].setAttribute("cy", String(pt.y));
        });
        if (p < 1) requestAnimationFrame(frame);
        else {
          g.remove();
          done();
        }
      };
      requestAnimationFrame(frame);
    },
    [pathEls],
  );

  const launch = useCallback(
    (m: Message) => {
      if (!present.has(m.to)) return;
      if (!present.has(m.from) || reduce) return deliver(m);
      const key = edgeKey(m.from, m.to);
      setSending((prev) => ({ ...prev, [m.from]: (prev[m.from] ?? 0) + 1 }));
      setLive((prev) => ({ ...prev, [key]: m.kind }));
      animatePacket(key, m.from, m.kind, () => {
        if (!alive.current) return;
        setSending((prev) => ({ ...prev, [m.from]: Math.max(0, (prev[m.from] ?? 1) - 1) }));
        deliver(m);
        later(() => setLive((prev) => {
          const { [key]: _gone, ...rest } = prev;
          return rest;
        }), 700);
      });
    },
    [present, reduce, deliver, animatePacket, later],
  );

  // Animate only messages that arrive while this board is open, not the history.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(messages.map((m) => m.id));
      return;
    }
    for (const m of messages) {
      if (seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      launch(m);
    }
  }, [messages, launch]);

  // ---- Focus: a clicked card highlights its wires and neighbours.
  const near = useMemo(() => {
    const set = new Set<string>();
    if (!focusId) return set;
    for (const key of edges) {
      const [a, b] = key.split("|");
      if (a === focusId) set.add(b);
      if (b === focusId) set.add(a);
    }
    return set;
  }, [edges, focusId]);

  const focusOf = (id: string): CardCommon["focus"] =>
    !focusId ? null : id === focusId ? "focus" : near.has(id) ? "near" : "dim";

  const isWaiting = (a: string, b: string) =>
    state.subAgents[a]?.waitingOn === b || state.subAgents[b]?.waitingOn === a;

  const inboxFor = (id: string): CardCommon["inbox"] => {
    const m = inbox[id];
    return m ? { message: m, fromName: participantName(state, m.from) } : undefined;
  };

  return (
    <section
      ref={boardRef}
      className={focusId ? "board focusing" : "board"}
      aria-label="Sub-agent board"
    >
      <svg className="wires" aria-hidden="true">
        {edges.map((key) => {
          const [a, b] = key.split("|");
          const cls = ["wire"];
          if (live[key]) cls.push("live", `k-${live[key]}`);
          if (isWaiting(a, b)) cls.push("wait");
          if (focusId && (a === focusId || b === focusId)) cls.push("hl");
          return <path key={key} ref={pathRef(key)} d={geo[key] ?? ""} className={cls.join(" ")} />;
        })}
      </svg>
      <div className="grid" style={{ "--cols": ids.length <= 4 ? 2 : 3 } as React.CSSProperties}>
        {ids.map((id) => {
          const common: CardCommon = {
            sending: Boolean(sending[id]),
            inbox: inboxFor(id),
            focus: focusOf(id),
            onToggleFocus: () => onToggleFocus(id),
            cardRef: cardRef(id),
          };
          if (id === HUMAN) {
            return (
              <HumanCard
                key={id}
                {...common}
                requests={requests}
                askerName={(sid) => participantName(state, sid)}
                onRespond={onRespond}
              />
            );
          }
          const sub = state.subAgents[id];
          return sub ? <SubAgentCard key={id} {...common} sub={sub} /> : null;
        })}
      </div>
      <svg className="fx" ref={fxRef} aria-hidden="true" />
    </section>
  );
}
