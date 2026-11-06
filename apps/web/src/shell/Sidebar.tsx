import { useRef, useState } from "react";
import type { Project, RunStatus } from "@orca/shared";
import { ChevronIcon, ComposeIcon, OrcaMark, PlusIcon, SidebarIcon, ThemeIcon } from "../components/icons";
import { StatusDot } from "../components/StatusDot";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
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

/** The Orca mark and name, in the sidebar and the phone header. */
export const brandClass =
  "inline-flex items-center gap-[9px] font-display text-[17px] leading-none font-bold tracking-[-0.02em] text-foreground no-underline [&_svg]:size-[22px] [&_svg]:shrink-0 [&_svg]:text-primary";

/** A link row: New run, a project, a run, the account. */
const row =
  "flex min-h-[34px] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-[13.5px] text-muted-foreground no-underline hover:bg-card hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-[inset_0_0_0_1px_var(--color-border)] [&>svg]:size-4 [&>svg]:shrink-0";
/** Text that hides while the sidebar is folded. */
const label = "min-w-0 flex-1 truncate folded:hidden";
const empty = "px-2.5 py-1.5 text-[12.5px] whitespace-normal text-faint folded:hidden";

const OPEN_KEY = "orca-open-projects";
function readOpen(): Set<string> {
  try {
    return new Set(JSON.parse(readPref(OPEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function Sidebar({ route, user, pin, folded, onToggleTheme }: Props & { folded: boolean }) {
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
    <nav
      className="absolute inset-y-0 left-0 w-full overflow-hidden border-r bg-panel transition-[width,box-shadow] duration-180 data-folded:hover:w-[264px] data-folded:hover:shadow-[18px_0_40px_-22px_rgba(0,0,0,0.6)] data-folded:focus-within:w-[264px] data-folded:focus-within:shadow-[18px_0_40px_-22px_rgba(0,0,0,0.6)] motion-reduce:transition-none"
      data-folded={folded || undefined}
      aria-label="Projects and runs"
    >
      <div className="flex h-full w-[264px] flex-col gap-0.5 px-2.5 pb-2.5 folded:w-[60px] folded:items-center max-[780px]:w-full">
        <div className="mb-1.5 flex h-14 flex-none items-center justify-between gap-2 pr-1 pl-2 folded:justify-center folded:p-0">
          <Link to="/" className={brandClass} aria-label="Orca home">
            <OrcaMark />
            <span className={label}>Orca</span>
          </Link>
          {pin && (
            <Button
              variant="ghost"
              size="icon"
              className="folded:hidden"
              onClick={pin.toggle}
              aria-label={pin.pinned ? "Fold sidebar" : "Keep sidebar open"}
              title={`${pin.pinned ? "Fold sidebar" : "Keep sidebar open"} (⌘B)`}
            >
              <SidebarIcon />
            </Button>
          )}
        </div>

        <Link
          to="/"
          className={cn(row, "mb-2 w-full flex-none font-semibold text-foreground")}
          aria-current={route.view === "home" ? "page" : undefined}
        >
          <ComposeIcon />
          <span className={label}>New run</span>
        </Link>

        <div className="flex items-center justify-between pt-2 pr-1 pb-1 pl-2.5 font-mono text-[10.5px] leading-none font-medium tracking-[0.12em] text-faint uppercase folded:hidden">
          <span>Projects</span>
          <Button
            ref={addRef}
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Add a project"
            aria-haspopup="dialog"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            <PlusIcon />
          </Button>
        </div>

        <div className="flex min-h-0 w-full flex-1 flex-col gap-px overflow-y-auto">
          {error && (
            <div className={empty}>
              {error}{" "}
              <Button variant="link" onClick={() => void refreshProjects()}>
                Try again
              </Button>
            </div>
          )}
          {loaded && !error && projects.length === 0 && <div className={empty}>Add a folder to start your first run.</div>}
          {projects.map((p) => {
            const isOpen = open.has(p.id) || p.slug === activeSlug;
            const signal = projectSignal(p);
            return (
              <div key={p.id}>
                <div className="relative flex items-center">
                  <button
                    className="absolute top-1/2 left-0 z-1 grid h-[26px] w-5 -translate-y-1/2 place-items-center rounded-md p-0 text-faint hover:text-foreground folded:hidden [&_svg]:size-[11px]"
                    type="button"
                    aria-label={isOpen ? `Hide runs in ${p.name}` : `Show runs in ${p.name}`}
                    aria-expanded={isOpen}
                    onClick={() => setProjectOpen(p.id, !isOpen)}
                  >
                    <span className={cn("inline-grid transition-transform", isOpen && "rotate-90")}>
                      <ChevronIcon />
                    </span>
                  </button>
                  <Link
                    to={`/p/${p.slug}`}
                    className={cn(row, "pl-[22px] folded:justify-center folded:pl-2.5")}
                    title={p.name}
                    aria-current={route.view === "project" && p.slug === activeSlug ? "page" : undefined}
                    onClick={() => setProjectOpen(p.id, true)}
                  >
                    <span className="relative grid size-[22px] flex-none place-items-center rounded-md border bg-card text-muted-foreground [&>svg]:size-3">
                      <ProjectGlyph project={p} />
                      {signal && (
                        <StatusDot
                          status={signal}
                          className="absolute -top-[3px] -right-[3px] shadow-[0_0_0_2px_var(--color-panel)]"
                        />
                      )}
                    </span>
                    <span className={label}>{p.name}</span>
                  </Link>
                </div>
                {isOpen && (
                  <div className="flex flex-col gap-px pt-px pb-1.5 pl-[22px] folded:hidden">
                    {p.runs.length === 0 && <div className={empty}>No runs yet</div>}
                    {p.runs.map((r) => (
                      <Link
                        key={r.id}
                        to={`/p/${p.slug}/r/${r.id}`}
                        className={cn(row, "min-h-[30px] py-[5px] text-[13px]")}
                        title={`${r.title} · ${RUN_STATUS_LABEL[r.status]}`}
                        aria-current={route.view === "run" && route.runId === r.id ? "page" : undefined}
                      >
                        <StatusDot status={r.status} />
                        <span className={label}>{r.title}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex w-full flex-none items-center gap-1 border-t pt-2">
          <Link to="/account" className={row} title="Account settings">
            <span className="grid size-6 flex-none place-items-center rounded-[7px] bg-[color-mix(in_oklab,var(--color-primary)_15%,var(--color-card))] font-mono text-[10px] leading-none font-semibold text-primary">
              {initials(name)}
            </span>
            <span className={label}>{name}</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="folded:hidden"
            onClick={onToggleTheme}
            aria-label="Switch theme"
            title="Switch theme"
          >
            <ThemeIcon />
          </Button>
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
