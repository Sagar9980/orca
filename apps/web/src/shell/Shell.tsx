import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FolderInfo, Project } from "@orca/shared";
import { Notice } from "../auth/ui";
import { ApiError } from "../lib/api";
import { bridgeError, desktop } from "../lib/desktop";
import { readPref, writePref } from "../lib/hooks";
import { addLocalProject, refreshProjects, useProjects } from "../projects/store";
import { clearQuery, Link, navigate, useLocation } from "../router";
import { ShellContext, type ShellActions, type Tone } from "./context";
import { Sidebar } from "./Sidebar";
import { HomeScreen, MobileBar, ProjectScreen } from "./StartScreen";
import { Workspace } from "./Workspace";

export type ShellRoute =
  | { view: "home" }
  | { view: "project"; slug: string }
  | { view: "run"; slug: string; runId: string };

interface Props {
  route: ShellRoute;
  user: { name: string; email: string };
  onToggleTheme: () => void;
}

const NARROW = "(max-width: 780px)";
const PIN_KEY = "orca-sidebar-pinned";

function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

/** Signed-in app: projects sidebar on the left, the current screen on the right. */
export function Shell({ route, user, onToggleTheme }: Props) {
  const { projects, loaded } = useProjects();
  const narrow = useMedia(NARROW);
  const [drawer, setDrawer] = useState(false);
  const [pinned, setPinned] = useState(() => readPref(PIN_KEY) === "1");
  const [toast, setToast] = useState<{ id: number; text: string; tone: Tone } | null>(null);
  const [gitAsk, setGitAsk] = useState<{ folder: FolderInfo; answer: (ok: boolean) => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { query } = useLocation();

  useEffect(() => void refreshProjects(), []);

  const showToast = useCallback((text: string, tone: Tone = "success") => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, tone });
    toastTimer.current = setTimeout(() => setToast(null), tone === "error" ? 7000 : 4500);
  }, []);

  // Arriving from the email verification link.
  useEffect(() => {
    if (query.get("verified") !== "1") return;
    clearQuery("verified");
    showToast(`Your email is verified. Welcome to Orca, ${user.name.split(" ")[0] || "there"}.`);
  }, [query, showToast, user.name]);

  // Close the mobile drawer whenever the screen changes.
  const routeKey = JSON.stringify(route);
  useEffect(() => setDrawer(false), [routeKey]);

  const togglePin = useCallback(() => {
    setPinned((p) => {
      writePref(PIN_KEY, p ? "0" : "1");
      return !p;
    });
  }, []);

  useEffect(() => {
    if (route.view !== "run" || narrow) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        togglePin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route.view, narrow, togglePin]);

  const addFolder = useCallback(async (): Promise<Project | null> => {
    if (!desktop) return null;
    let folder: FolderInfo | null;
    try {
      folder = await desktop.chooseFolder();
    } catch (err) {
      showToast(bridgeError(err), "error");
      return null;
    }
    if (!folder) return null;

    if (!folder.isGit) {
      const picked = folder;
      const ok = await new Promise<boolean>((answer) => setGitAsk({ folder: picked, answer }));
      setGitAsk(null);
      if (!ok) return null;
      try {
        folder = await desktop.initGit(picked.path);
      } catch (err) {
        showToast(bridgeError(err), "error");
        return null;
      }
    }

    try {
      const project = await addLocalProject(folder);
      showToast(`Added ${project.name}.`);
      return project;
    } catch (err) {
      if (err instanceof ApiError && err.code === "exists" && typeof err.body.slug === "string") {
        showToast(err.message, "info");
        navigate(`/p/${err.body.slug}`);
      } else {
        showToast(err instanceof Error ? err.message : "Couldn't add the folder.", "error");
      }
      return null;
    }
  }, [showToast]);

  const actions = useMemo<ShellActions>(
    () => ({
      toast: showToast,
      addFolder,
      openDrawer: () => setDrawer(true),
      closeDrawer: () => setDrawer(false),
    }),
    [showToast, addFolder],
  );

  const inRun = route.view === "run";
  const rail = inRun && !pinned && !narrow;
  const project = route.view === "home" ? undefined : projects.find((p) => p.slug === route.slug);
  const run = route.view === "run" ? project?.runs.find((r) => r.id === route.runId) : undefined;

  let screen;
  if (route.view === "home") screen = <HomeScreen />;
  else if (!loaded) screen = <div className="boot">Loading projects…</div>;
  else if (!project || (route.view === "run" && !run)) screen = <Missing what={project ? "run" : "project"} />;
  else if (route.view === "run" && run) screen = <Workspace key={run.id} project={project} run={run} />;
  else screen = <ProjectScreen key={project.id} project={project} />;

  const classes = ["app-shell", rail && "is-rail", drawer && "is-drawer"].filter(Boolean).join(" ");

  return (
    <ShellContext.Provider value={actions}>
      <div className={classes}>
        <div className="sb-col">
          <Sidebar
            route={route}
            user={user}
            onToggleTheme={onToggleTheme}
            pin={inRun && !narrow ? { pinned, toggle: togglePin } : null}
          />
        </div>
        <div className="sb-scrim" onClick={() => setDrawer(false)} aria-hidden="true" />
        <main className="sh-main">{screen}</main>
      </div>

      {gitAsk && <GitDialog folder={gitAsk.folder} onAnswer={gitAsk.answer} />}
      {toast && (
        <div className="toast" key={toast.id}>
          <Notice tone={toast.tone}>{toast.text}</Notice>
        </div>
      )}
    </ShellContext.Provider>
  );
}

function Missing({ what }: { what: "project" | "run" }) {
  return (
    <>
      <MobileBar />
      <div className="boot">
        <p>{what === "project" ? "There's no project at this address." : "This run doesn't exist anymore."}</p>
        <Link to="/">Go to Orca</Link>
      </div>
    </>
  );
}

function GitDialog({ folder, onAnswer }: { folder: FolderInfo; onAnswer: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onAnswer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnswer]);

  return (
    <div className="dlg-scrim" onClick={(e) => e.target === e.currentTarget && onAnswer(false)}>
      <div className="dlg" role="alertdialog" aria-modal="true" aria-labelledby="git-title" aria-describedby="git-body">
        <h2 id="git-title">Set up git in {folder.name}?</h2>
        <p id="git-body">
          This folder isn't a git repository. Orca's agents keep their changes on git branches, so the project needs
          git. Orca will run <code>git init</code> here and change nothing else.
        </p>
        <p className="dlg-path mono">{folder.path}</p>
        <div className="dlg-actions">
          <button className="btn" type="button" onClick={() => onAnswer(false)}>
            Cancel
          </button>
          <button ref={confirmRef} className="btn-primary" type="button" onClick={() => onAnswer(true)}>
            Set up git
          </button>
        </div>
      </div>
    </div>
  );
}
