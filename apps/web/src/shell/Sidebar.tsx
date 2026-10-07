import { useRef, useState } from "react";
import type { Project, RunStatus } from "@orca/shared";
import { ChevronIcon, ComposeIcon, OrcaMark, PlusIcon, SidebarIcon, ThemeIcon } from "../components/icons";
import { initials } from "../lib/labels";
import { readPref, writePref } from "../lib/hooks";
import { refreshProjects, useProjects } from "../projects/store";
import { Link, navigate } from "../router";
import { Popover } from "./Popover";
import { ProjectGlyph, ProjectMenu } from "./ProjectMenu";
import type { ShellRoute } from "./Shell";

interface Props {
  route: ShellRoute;
  user: { name: string; email: string };
  /** Shown only in a workspace, where the sidebar can fold into an icon strip. */
  pin: { pinned: boolean; toggle: () => void } | null;
  onToggleTheme: () => void;
}

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  planning: "Planning",
  running: "Running",
  paused: "Paused",
  needs_human: "Needs you",
  done: "Done",
  failed: "Failed",
};

/** The most urgent state among a project's runs, for the dot on its icon. */
function projectSignal(p: Project): RunStatus | null {
  const states = new Set(p.runs.map((r) => r.status));
  if (states.has("needs_human")) return "needs_human";
  if (states.has("failed")) return "failed";
  if (states.has("running")) return "running";
  return null;
}

const OPEN_KEY = "orca-open-projects";
function readOpen(): Set<string> {
  try {
    return new Set(JSON.parse(readPref(OPEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function Sidebar({ route, user, pin, onToggleTheme }: Props) {
  const { projects, loaded, error } = useProjects();
  const [open, setOpen] = useState(readOpen);
  const [menu, setMenu] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const activeSlug = route.view === "home" ? null : route.slug;

  const setProjectOpen = (id: string, next: boolean) =>
    setOpen((cur) => {
      const copy = new Set(cur);
      if (next) copy.add(id);
      else copy.delete(id);
      writePref(OPEN_KEY, JSON.stringify([...copy]));
      return copy;
    });

  const name = user.name || user.email;

  return (
    <nav className="sb" aria-label="Projects and runs">
      <div className="sb-in">
        <div className="sb-top">
          <Link to="/" className="sb-brand" aria-label="Orca home">
            <OrcaMark />
            <span className="sb-lbl">Orca</span>
          </Link>
          {pin && (
            <button
              className="sb-icon sb-lbl"
              type="button"
              onClick={pin.toggle}
              aria-label={pin.pinned ? "Fold sidebar" : "Keep sidebar open"}
              title={`${pin.pinned ? "Fold sidebar" : "Keep sidebar open"} (⌘B)`}
            >
              <SidebarIcon />
            </button>
          )}
        </div>

        <Link to="/" className="sb-row sb-new" aria-current={route.view === "home" ? "page" : undefined}>
          <ComposeIcon />
          <span className="sb-lbl">New run</span>
        </Link>

        <div className="sb-sec">
          <span>Projects</span>
          <button
            ref={addRef}
            className="sb-icon"
            type="button"
            aria-label="Add a project"
            aria-haspopup="dialog"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            <PlusIcon />
          </button>
        </div>

        <div className="sb-list">
          {error && (
            <div className="sb-empty sb-lbl">
              {error}{" "}
              <button className="linkbtn" type="button" onClick={() => void refreshProjects()}>
                Try again
              </button>
            </div>
          )}
          {loaded && !error && projects.length === 0 && (
            <div className="sb-empty sb-lbl">Add a folder to start your first run.</div>
          )}
          {projects.map((p) => {
            const isOpen = open.has(p.id) || p.slug === activeSlug;
            const signal = projectSignal(p);
            return (
              <div key={p.id} className={isOpen ? "sb-proj is-open" : "sb-proj"}>
                <div className="sb-proj-row">
                  <button
                    className="sb-chev"
                    type="button"
                    aria-label={isOpen ? `Hide runs in ${p.name}` : `Show runs in ${p.name}`}
                    aria-expanded={isOpen}
                    onClick={() => setProjectOpen(p.id, !isOpen)}
                  >
                    <ChevronIcon />
                  </button>
                  <Link
                    to={`/p/${p.slug}`}
                    className="sb-row"
                    title={p.name}
                    aria-current={route.view === "project" && p.slug === activeSlug ? "page" : undefined}
                    onClick={() => setProjectOpen(p.id, true)}
                  >
                    <span className="sb-glyph">
                      <ProjectGlyph project={p} />
                      {signal && <i className={`dot dot-${signal}`} />}
                    </span>
                    <span className="sb-lbl">{p.name}</span>
                  </Link>
                </div>
                {isOpen && (
                  <div className="sb-runs">
                    {p.runs.length === 0 && <div className="sb-empty sb-lbl">No runs yet</div>}
                    {p.runs.map((r) => (
                      <Link
                        key={r.id}
                        to={`/p/${p.slug}/r/${r.id}`}
                        className="sb-row sb-run"
                        title={`${r.title} · ${RUN_STATUS_LABEL[r.status]}`}
                        aria-current={route.view === "run" && route.runId === r.id ? "page" : undefined}
                      >
                        <i className={`dot dot-${r.status}`} aria-hidden="true" />
                        <span className="sb-lbl">{r.title}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="sb-foot">
          <Link to="/account" className="sb-row" title="Account settings">
            <span className="sb-av">{initials(name)}</span>
            <span className="sb-lbl">{name}</span>
          </Link>
          <button className="sb-icon sb-lbl" type="button" onClick={onToggleTheme} aria-label="Switch theme" title="Switch theme">
            <ThemeIcon />
          </button>
        </div>
      </div>

      {menu && (
        <Popover anchor={addRef} onClose={() => setMenu(false)} label="Add a project">
          <ProjectMenu
            projects={projects}
            onClose={() => setMenu(false)}
            onChoose={(p) => {
              setMenu(false);
              navigate(`/p/${p.slug}`);
            }}
            onAdded={(p) => navigate(`/p/${p.slug}`)}
          />
        </Popover>
      )}
    </nav>
  );
}
