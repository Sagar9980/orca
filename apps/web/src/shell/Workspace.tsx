import { useEffect, useMemo, useState } from "react";
import type { Project, RunSummary } from "@orca/shared";
import { AgentRail } from "../components/AgentRail";
import { Boot } from "../components/Boot";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { BranchIcon, MenuIcon, PauseIcon, PlayIcon } from "../components/icons";
import { Stage } from "../components/Stage";
import { desktop } from "../lib/desktop";
import { readPref, writePref, useNow } from "../lib/hooks";
import { formatClock } from "../lib/labels";
import { RUN_TONE } from "../lib/tones";
import { cn } from "../lib/utils";
import { Link } from "../router";
import { createDemoSource } from "../run/demoSource";
import { createDesktopSource } from "../run/desktopSource";
import { useRun } from "../run/useRun";
import { useShell } from "./context";

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
  // Uncommitted work in the project, checked before a run starts: the agent works from the last commit.
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    if (!desktop || !folder || state) return;
    let live = true;
    desktop.inspectFolder(folder).then((info) => live && setChanges(info?.changes ?? 0), () => {});
    return () => {
      live = false;
    };
  }, [folder, Boolean(state)]);
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
    <div className={cn("flex min-h-0 flex-1 flex-col", paused && "paused")}>
      <header className="flex h-14 flex-none items-center gap-4 border-b pr-4 pl-5 max-[780px]:h-auto max-[780px]:min-h-14 max-[780px]:flex-wrap max-[780px]:gap-x-2.5 max-[780px]:gap-y-2 max-[780px]:px-3 max-[780px]:py-2">
        <Button
          variant="ghost"
          size="icon"
          className="hidden max-[780px]:inline-flex"
          onClick={shell.openDrawer}
          aria-label="Open sidebar"
        >
          <MenuIcon />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px]">
          <Link
            to={`/p/${project.slug}`}
            className="flex-none rounded-md px-1 py-0.5 text-muted-foreground no-underline hover:bg-card hover:text-foreground"
          >
            {project.name}
          </Link>
          <span aria-hidden="true" className="text-faint">
            /
          </span>
          <h1 title={run.title} className="min-w-0 truncate font-display text-[14.5px] leading-[1.2] font-[650]">
            {run.title}
          </h1>
          <Badge
            tone={RUN_TONE[status]}
            className="px-2 py-[5px] text-[10.5px] tracking-[0.06em] before:size-1.5 before:rounded-full before:bg-current"
          >
            {STATUS_TEXT[status]}
          </Badge>
        </div>
        {live && (
          <div className="flex flex-none items-center gap-4 font-mono text-xs leading-none whitespace-nowrap text-muted-foreground tabular-nums max-[780px]:order-3 max-[780px]:w-full [&_b]:font-medium [&_b]:text-foreground [&_svg]:size-3 [&_svg]:text-faint [&>span]:inline-flex [&>span]:items-center [&>span]:gap-[5px]">
            <span title={`Started from ${run.branch}`}>
              <BranchIcon />
              <b>{run.branch}</b>
            </span>
            <span className="max-[960px]:hidden! max-[780px]:inline-flex!">
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
              <Button variant="outline" className="h-8" onClick={() => send({ type: "run.create", idea: run.title })}>
                <PlayIcon />
                Replay
              </Button>
            )
          ) : (
            <Button
              variant="outline"
              className="h-8"
              onClick={() => send({ type: paused ? "run.resume" : "run.pause", runId: live.id })}
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
              {paused ? "Resume" : "Pause"}
            </Button>
          ))}
      </header>
      {!folder && (
        <p className="flex-none border-b bg-warning/7 px-5 py-[7px] text-[12.5px] text-muted-foreground max-[780px]:px-4">
          Example agents:{" "}
          {desktop ? `${project.name}'s folder isn't on this computer` : "agents run in the desktop app"}, so this run
          plays a sample team instead of working on {project.name}.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-5 max-[780px]:p-4">
        {state && agent ? (
          <div className="mx-auto grid max-w-[1480px] grid-cols-[300px_minmax(0,1fr)] gap-7 max-[920px]:grid-cols-[minmax(0,1fr)]">
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
          <Boot className="min-h-[50vh] gap-3.5 font-sans [&_b]:font-medium [&_b]:text-foreground [&_p]:max-w-[520px] [&_p]:leading-[1.55]">
            {state ? (
              <p>{state.run.summary ?? "Starting…"}</p>
            ) : (
              <>
                <p>
                  A Builder agent will work on {project.name} on its own <b>orca/run-*</b> branch, made from{" "}
                  <b>{run.branch}</b>. Your checkout isn't touched. It asks you before running commands or creating
                  files, and stops at ${run.budgetUsd}.
                </p>
                {changes > 0 && (
                  <p className="rounded-lg border border-warning/45 bg-warning/10 px-3.5 py-2.5 text-left text-sm">
                    You have {changes} uncommitted {changes === 1 ? "change" : "changes"} in {project.name}. The agent
                    starts from your last commit, so it won't see {changes === 1 ? "it" : "them"}. Commit first if
                    the task depends on {changes === 1 ? "it" : "them"}.
                  </p>
                )}
                <Button
                  size="lg"
                  onClick={() => {
                    setStartError(null);
                    send({ type: "run.create", idea: run.title });
                  }}
                >
                  <PlayIcon />
                  Start run
                </Button>
              </>
            )}
            {startError && <p className="text-destructive">{startError}</p>}
          </Boot>
        ) : (
          <Boot className="min-h-[50vh]">Starting agents…</Boot>
        )}
      </div>
    </div>
  );
}
