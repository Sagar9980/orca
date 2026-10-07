import { useState } from "react";
import type { Project, RunSummary } from "@orca/shared";
import { MenuIcon, OrcaMark } from "../components/icons";
import { desktop } from "../lib/desktop";
import { readPref, writePref } from "../lib/hooks";
import { removeProject, useProjects } from "../projects/store";
import { Link, navigate } from "../router";
import { Composer } from "./Composer";
import { useShell } from "./context";
import { projectLocation } from "./ProjectMenu";
import { RUN_STATUS_LABEL } from "./Sidebar";

const LAST_PROJECT = "orca-last-project";

function timeAgo(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function RunRow({ run, project, showProject }: { run: RunSummary; project: Project; showProject?: boolean }) {
  return (
    <Link to={`/p/${project.slug}/r/${run.id}`} className="hs-run">
      <i className={`dot dot-${run.status}`} aria-hidden="true" />
      <span className="hs-run-title">
        {run.title}
        {showProject && <small>{project.name}</small>}
      </span>
      <span className="hs-run-when">
        {run.status === "needs_human" ? "needs you" : `${RUN_STATUS_LABEL[run.status].toLowerCase()} · ${timeAgo(run.createdAt)}`}
      </span>
    </Link>
  );
}

export function MobileBar() {
  const shell = useShell();
  return (
    <div className="sh-mbar">
      <button className="sb-icon" type="button" onClick={shell.openDrawer} aria-label="Open sidebar">
        <MenuIcon />
      </button>
      <Link to="/" className="sb-brand">
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
      <div className="hs">
        <div className="hs-in">
          <h1>What should Orca build?</h1>
          <Composer projects={projects} project={project} onSelectProject={select} />
          {loaded && projects.length === 0 && (
            <p className="hs-hint">
              Orca works inside a project.{" "}
              {desktop ? (
                <button
                  className="linkbtn"
                  type="button"
                  onClick={async () => {
                    const p = await shell.addFolder();
                    if (p) select(p);
                  }}
                >
                  Open a folder
                </button>
              ) : (
                <span>Open the Orca desktop app to add a folder from your computer.</span>
              )}
            </p>
          )}
          {recent.length > 0 && (
            <section className="hs-list" aria-label="Recent runs">
              <h2 className="eyebrow">Recent runs</h2>
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
      <div className="hs">
        <div className="hs-in">
          <div className="hs-head">
            <h1>{project.name}</h1>
            <p className="hs-where mono">{projectLocation(project)}</p>
            {missing && desktop && (
              <p className="hs-warn">This project was added on another computer, so its folder isn't here.</p>
            )}
          </div>
          <Composer projects={projects} project={project} onSelectProject={(p) => navigate(`/p/${p.slug}`)} />
          <section className="hs-list" aria-label={`Runs in ${project.name}`}>
            <h2 className="eyebrow">Runs</h2>
            {project.runs.length === 0 ? (
              <p className="hs-none">No runs yet. Describe what to build and Orca starts the first one.</p>
            ) : (
              project.runs.map((run) => <RunRow key={run.id} run={run} project={project} />)
            )}
          </section>
          <div className="hs-danger">
            {confirming ? (
              <>
                <span>
                  Remove <b>{project.name}</b> and its run history from Orca? Your folder stays as it is.
                </span>
                <button className="btn btn-danger-outline" type="button" disabled={removing} onClick={remove}>
                  {removing ? "Removing…" : "Remove"}
                </button>
                <button className="btn" type="button" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="linkbtn linkbtn-quiet" type="button" onClick={() => setConfirming(true)}>
                Remove project from Orca
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
