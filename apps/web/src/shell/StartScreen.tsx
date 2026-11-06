import { useState } from "react";
import type { Project, RunSummary } from "@orca/shared";
import { MenuIcon, OrcaMark } from "../components/icons";
import { StatusDot } from "../components/StatusDot";
import { Button } from "../components/ui/button";
import { desktop } from "../lib/desktop";
import { readPref, writePref } from "../lib/hooks";
import { removeProject, useProjects } from "../projects/store";
import { Link, navigate } from "../router";
import { Composer } from "./Composer";
import { useShell } from "./context";
import { projectLocation } from "./ProjectMenu";
import { brandClass, RUN_STATUS_LABEL } from "./Sidebar";
import { cn } from "../lib/utils";

const LAST_PROJECT = "orca-last-project";

function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** The scrolling page around a start screen, and its centered column. */
const page = "flex flex-1 justify-center overflow-y-auto px-6 pt-[max(9vh,40px)] pb-16 max-[780px]:px-4 max-[780px]:pt-7 max-[780px]:pb-12";
const column = "flex w-[min(700px,100%)] flex-col gap-[22px]";
const list = "flex flex-col gap-0.5";
const title = "font-display text-[clamp(28px,4vw,38px)] leading-[1.08] font-[720] tracking-[-0.03em] text-balance wrap-anywhere";

function RunRow({ run, project, showProject }: { run: RunSummary; project: Project; showProject?: boolean }) {
  return (
    <Link
      to={`/p/${project.slug}/r/${run.id}`}
      className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-3 py-2.5 text-foreground no-underline hover:bg-panel"
    >
      <StatusDot status={run.status} />
      <span className="truncate text-[13.5px]">
        {run.title}
        {showProject && <small className="ml-2 font-mono text-[11.5px] text-faint">{project.name}</small>}
      </span>
      <span className="font-mono text-[11.5px] whitespace-nowrap text-faint">
        {run.status === "needs_human" ? "needs you" : `${RUN_STATUS_LABEL[run.status].toLowerCase()} · ${timeAgo(run.createdAt)}`}
      </span>
    </Link>
  );
}

export function MobileBar() {
  const shell = useShell();
  return (
    <div className="hidden h-14 flex-none items-center gap-2 border-b px-3 max-[780px]:flex">
      <Button variant="ghost" size="icon" onClick={shell.openDrawer} aria-label="Open sidebar">
        <MenuIcon />
      </Button>
      <Link to="/" className={brandClass}>
        <OrcaMark />
        Orca
      </Link>
    </div>
  );
}

/** "/" — the composer, aimed at the project you used last. */
export function HomeScreen() {
  const { projects, loaded } = useProjects();
  const shell = useShell();
  const [pickedId, setPickedId] = useState(() => readPref(LAST_PROJECT));
  const project = projects.find((p) => p.id === pickedId) ?? projects[0];
  const recent = projects
    .flatMap((p) => p.runs.map((run) => ({ run, project: p })))
    .sort((a, b) => Date.parse(b.run.createdAt) - Date.parse(a.run.createdAt))
    .slice(0, 5);

  const select = (p: Project) => {
    setPickedId(p.id);
    writePref(LAST_PROJECT, p.id);
  };

  return (
    <>
      <MobileBar />
      <div className={page}>
        <div className={column}>
          <h1 className={cn(title, "text-center")}>What should Orca build?</h1>
          <Composer projects={projects} project={project} onSelectProject={select} />
          {loaded && projects.length === 0 && (
            <p className="text-center text-[13px] text-muted-foreground">
              Orca works inside a project.{" "}
              {desktop ? (
                <Button
                  variant="link"
                  onClick={async () => {
                    const p = await shell.addFolder();
                    if (p) select(p);
                  }}
                >
                  Open a folder
                </Button>
              ) : (
                <span>Open the Orca desktop app to add a folder from your computer.</span>
              )}
            </p>
          )}
          {recent.length > 0 && (
            <section className={list} aria-label="Recent runs">
              <h2 className="eyebrow mx-3 my-1.5 text-faint">Recent runs</h2>
              {recent.map(({ run, project: p }) => (
                <RunRow key={run.id} run={run} project={p} showProject />
              ))}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/** "/p/:slug" — one project: its composer and run history. */
export function ProjectScreen({ project }: { project: Project }) {
  const { projects } = useProjects();
  const shell = useShell();
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const missing = project.source === "local" && !project.folder;

  const remove = async () => {
    setRemoving(true);
    try {
      await removeProject(project.id);
      shell.toast(`Removed ${project.name} from Orca. Its folder is unchanged.`, "success");
      navigate("/", { replace: true });
    } catch (err) {
      shell.toast(err instanceof Error ? err.message : "Couldn't remove the project.", "error");
      setRemoving(false);
    }
  };

  return (
    <>
      <MobileBar />
      <div className={page}>
        <div className={column}>
          <div className="flex flex-col items-center gap-2 text-center">
            <h1 className={title}>{project.name}</h1>
            <p className="font-mono text-xs wrap-anywhere text-muted-foreground">{projectLocation(project)}</p>
            {missing && desktop && (
              <p className="text-[13px] text-warning">This project was added on another computer, so its folder isn't here.</p>
            )}
          </div>
          <Composer projects={projects} project={project} onSelectProject={(p) => navigate(`/p/${p.slug}`)} />
          <section className={list} aria-label={`Runs in ${project.name}`}>
            <h2 className="eyebrow mx-3 my-1.5 text-faint">Runs</h2>
            {project.runs.length === 0 ? (
              <p className="px-3 py-2 text-[13.5px] text-faint">No runs yet. Describe what to build and Orca starts the first one.</p>
            ) : (
              project.runs.map((run) => <RunRow key={run.id} run={run} project={project} />)
            )}
          </section>
          <div className="flex flex-wrap items-center justify-center gap-2.5 border-t pt-[18px] text-center text-[13px] text-muted-foreground">
            {confirming ? (
              <>
                <span>
                  Remove <b>{project.name}</b> and its run history from Orca? Your folder stays as it is.
                </span>
                <Button variant="destructive-outline" size="sm" disabled={removing} onClick={remove}>
                  {removing ? "Removing…" : "Remove"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="link" className="text-faint hover:text-destructive" onClick={() => setConfirming(true)}>
                Remove project from Orca
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
