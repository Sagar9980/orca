import { useEffect, useMemo, useState } from "react";
import type { Project, RunSummary } from "@orca/shared";
import { AgentRail } from "../components/AgentRail";
import { BranchIcon, MenuIcon, PauseIcon, PlayIcon } from "../components/icons";
import { Stage } from "../components/Stage";
import { desktop } from "../lib/desktop";
import { readPref, writePref, useNow } from "../lib/hooks";
import { formatClock } from "../lib/labels";
import { Link } from "../router";
import { createDemoSource } from "../run/demoSource";
import { createDesktopSource } from "../run/desktopSource";
import { useRun } from "../run/useRun";
import { useShell } from "./context";

const RUN_STATUS_TONE: Record<string, string> = {
  running: "running",
  planning: "running",
  needs_human: "needs_human",
  paused: "paused",
  done: "done",
  failed: "failed",
};
const STATUS_TEXT: Record<string, string> = {
  running: "Running",
  planning: "Planning",
  needs_human: "Needs you",
  paused: "Paused",
  done: "Done",
  failed: "Failed",
};

/** "/p/:slug/r/:runId" — the full-size agent workspace for one run. */
export function Workspace({ project, run }: { project: Project; run: RunSummary }) {
  const shell = useShell();
  const [startError, setStartError] = useState<string | null>(null);
  // In the desktop app, with the project's folder on this computer, a real agent works on it. Anywhere else the
  // run plays the example team. One source per run.
  const folder = desktop ? project.folder : null;
  const source = useMemo(
    () =>
      desktop && folder
        ? createDesktopSource(
            desktop,
            { runId: run.id, title: run.title, folder, branch: run.branch, budgetUsd: run.budgetUsd },
            setStartError,
          )
        : createDemoSource(),
    [run.id, folder],
  );
  useEffect(() => () => source.close?.(), [source]);
  const { state, send } = useRun(source);
  const [selectedId, setSelectedId] = useState(() => readPref("orca-agent"));

  const live = state?.run;
  const finished = Boolean(live?.finishedAt);
  const paused = live?.status === "paused";
  const now = useNow(1000, Boolean(live) && !finished && !paused);
  const status = live?.status ?? "planning";

  const select = (id: string) => {
    setSelectedId(id);
    writePref("orca-agent", id);
  };
  const agent = state && ((selectedId && state.agents[selectedId]) || Object.values(state.agents)[0]);

  return (
    <div className={paused ? "wk paused" : "wk"}>
      <header className="wk-top">
        <button className="sb-icon wk-menu" type="button" onClick={shell.openDrawer} aria-label="Open sidebar">
          <MenuIcon />
        </button>
        <div className="wk-crumb">
          <Link to={`/p/${project.slug}`}>{project.name}</Link>
          <span aria-hidden="true">/</span>
          <h1 title={run.title}>{run.title}</h1>
          <span className={`wk-pill tone-${RUN_STATUS_TONE[status]}`}>{STATUS_TEXT[status]}</span>
        </div>
        {live && (
          <div className="wk-meters">
            <span className="wk-branch" title={`Started from ${run.branch}`}>
              <BranchIcon />
              <b>{run.branch}</b>
            </span>
            <span>
              Elapsed <b>{formatClock((live.finishedAt ? Date.parse(live.finishedAt) : now) - Date.parse(live.startedAt))}</b>
            </span>
            <span>
              Spend <b>${live.budget.spentUsd.toFixed(2)}</b> / ${run.budgetUsd}
            </span>
          </div>
        )}
        {live &&
          (finished ? (
            !folder && (
              <button className="btn" type="button" onClick={() => send({ type: "run.create", idea: run.title })}>
                <PlayIcon />
                Replay
              </button>
            )
          ) : (
            <button
              className="btn"
              type="button"
              onClick={() => send({ type: paused ? "run.resume" : "run.pause", runId: live.id })}
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
              {paused ? "Resume" : "Pause"}
            </button>
          ))}
      </header>
      {!folder && (
        <p className="wk-example">
          Example agents:{" "}
          {desktop ? `${project.name}'s folder isn't on this computer` : "agents run in the desktop app"}, so this run
          plays a sample team instead of working on {project.name}.
        </p>
      )}
      <div className="wk-body">
        {state && agent ? (
          <div className="shell">
            <AgentRail state={state} selectedId={agent.id} onSelect={select} />
            <Stage
              key={agent.id}
              state={state}
              agent={agent}
              paused={paused}
              onRespond={(requestId, response) => send({ type: "human.respond", runId: state.run.id, requestId, response })}
            />
          </div>
        ) : folder ? (
          <div className="boot wk-start">
            {state ? (
              <p>{state.run.summary ?? "Starting…"}</p>
            ) : (
              <>
                <p>
                  A Builder agent will work on {project.name} on its own <b>orca/run-*</b> branch, made from{" "}
                  <b>{run.branch}</b>. Your checkout isn't touched. It asks you before running commands or creating
                  files, and stops at ${run.budgetUsd}.
                </p>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => {
                    setStartError(null);
                    send({ type: "run.create", idea: run.title });
                  }}
                >
                  <PlayIcon />
                  Start run
                </button>
              </>
            )}
            {startError && <p className="wk-start-error">{startError}</p>}
          </div>
        ) : (
          <div className="boot">Starting agents…</div>
        )}
      </div>
    </div>
  );
}
