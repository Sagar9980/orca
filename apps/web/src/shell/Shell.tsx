import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FolderInfo, Project } from "@orca/shared";
import { Notice } from "../auth/ui";
import { Boot } from "../components/Boot";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
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
  // Resolves addFolder's pending git question; answered "no" if Shell unmounts (e.g. sign-out) while it's open.
  const gitAnswer = useRef<((ok: boolean) => void) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { query } = useLocation();

  useEffect(() => void refreshProjects(), []);
  useEffect(() => () => gitAnswer.current?.(false), []);

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
      const ok = await new Promise<boolean>((answer) => {
        gitAnswer.current = answer;
        setGitAsk({ folder: picked, answer });
      });
      gitAnswer.current = null;
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
  else if (!loaded) screen = <Boot className="min-h-0 flex-1">Loading projects…</Boot>;
  else if (!project || (route.view === "run" && !run)) screen = <Missing what={project ? "run" : "project"} />;
  else if (route.view === "run" && run) screen = <Workspace key={run.id} project={project} run={run} />;
  else screen = <ProjectScreen key={project.id} project={project} />;

  return (
    <ShellContext.Provider value={actions}>
      <div
        className={cn(
          "fixed inset-x-0 top-tb bottom-0 grid grid-cols-[264px_minmax(0,1fr)] bg-background transition-[grid-template-columns] duration-200 max-[780px]:grid-cols-[minmax(0,1fr)] motion-reduce:transition-none",
          rail && "grid-cols-[60px_minmax(0,1fr)]",
        )}
      >
        {/* On phones the sidebar is a drawer that slides in over the page. */}
        <div
          className={cn(
            "relative z-5 min-w-0 max-[780px]:fixed max-[780px]:top-tb max-[780px]:bottom-0 max-[780px]:left-0 max-[780px]:z-45 max-[780px]:w-[min(290px,86vw)] max-[780px]:-translate-x-[102%] max-[780px]:transition-transform max-[780px]:duration-200 motion-reduce:transition-none",
            drawer && "max-[780px]:translate-x-0 max-[780px]:shadow-[18px_0_40px_-18px_rgba(0,0,0,0.6)]",
          )}
        >
          <Sidebar
            route={route}
            user={user}
            folded={rail}
            onToggleTheme={onToggleTheme}
            pin={inRun && !narrow ? { pinned, toggle: togglePin } : null}
          />
        </div>
        {drawer && narrow && (
          <div
            className="fixed inset-x-0 top-tb bottom-0 z-44 bg-background/60"
            onClick={() => setDrawer(false)}
            aria-hidden="true"
          />
        )}
        <main className="relative flex h-full min-w-0 flex-col overflow-hidden">{screen}</main>
      </div>

      {gitAsk && <GitDialog folder={gitAsk.folder} onAnswer={gitAsk.answer} />}
      {toast && (
        <div
          className="fixed bottom-[calc(24px+env(safe-area-inset-bottom,0px))] left-1/2 z-20 w-[min(460px,calc(100%-32px))] -translate-x-1/2 rounded-lg bg-card shadow-[0_18px_40px_-16px_rgba(0,0,0,0.5)]"
          key={toast.id}
        >
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
      <Boot className="min-h-0 flex-1">
        <p>{what === "project" ? "There's no project at this address." : "This run doesn't exist anymore."}</p>
        <Link to="/">Go to Orca</Link>
      </Boot>
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
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-background/65 p-4"
      onClick={(e) => e.target === e.currentTarget && onAnswer(false)}
    >
      <div
        className="flex w-[min(460px,100%)] flex-col gap-3 rounded-2xl border border-border-strong bg-panel p-[22px] shadow-[0_30px_70px_-20px_rgba(0,0,0,0.6)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="git-title"
        aria-describedby="git-body"
      >
        <h2 id="git-title" className="font-display text-[19px] leading-[1.2] font-bold wrap-anywhere">
          Set up git in {folder.name}?
        </h2>
        <p id="git-body" className="text-[13.5px] leading-[1.55] text-muted-foreground">
          This folder isn't a git repository. Orca's agents keep their changes on git branches, so the project needs
          git. Orca will run <code className="font-mono text-[12.5px] text-foreground">git init</code> here and change
          nothing else.
        </p>
        <p className="rounded-md bg-background px-2.5 py-2 font-mono text-xs wrap-anywhere text-muted-foreground">
          {folder.path}
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" className="h-9" onClick={() => onAnswer(false)}>
            Cancel
          </Button>
          <Button ref={confirmRef} size="lg" className="h-9" onClick={() => onAnswer(true)}>
            Set up git
          </Button>
        </div>
      </div>
    </div>
  );
}
