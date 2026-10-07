import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { DEFAULT_RUN_BUDGET_USD, RUN_BUDGET_CHOICES_USD, type Project } from "@orca/shared";
import { Notice } from "../auth/ui";
import { ArrowUpIcon, BranchIcon, CaretIcon, CheckIcon, CoinIcon, PlusIcon } from "../components/icons";
import { desktop } from "../lib/desktop";
import { navigate } from "../router";
import { startRun } from "../projects/store";
import { Popover } from "./Popover";
import { ProjectGlyph, ProjectMenu } from "./ProjectMenu";

interface Props {
  projects: Project[];
  project: Project | undefined;
  onSelectProject: (project: Project) => void;
}

type Menu = "project" | "branch" | "budget" | null;

/** "What should Orca build?" box. Starting a run creates it on the server and opens its workspace. */
export function Composer({ projects, project, onSelectProject }: Props) {
  const [draft, setDraft] = useState("");
  const [branch, setBranch] = useState(project?.defaultBranch ?? "main");
  const [branches, setBranches] = useState<string[]>([]);
  const [budget, setBudget] = useState<number>(DEFAULT_RUN_BUDGET_USD);
  const [menu, setMenu] = useState<Menu>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const projectChip = useRef<HTMLButtonElement>(null);
  const branchChip = useRef<HTMLButtonElement>(null);
  const budgetChip = useRef<HTMLButtonElement>(null);

  // A new project: start from its default branch and, in the desktop app, read its other branches.
  useEffect(() => {
    setBranch(project?.defaultBranch ?? "main");
    setBranches([]);
    if (!desktop || !project?.folder) return;
    let live = true;
    desktop
      .inspectFolder(project.folder)
      .then((info) => live && info && setBranches(info.branches))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [project?.id, project?.folder, project?.defaultBranch]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(260, el.scrollHeight)}px`;
  }, [draft]);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) textRef.current?.focus();
  }, [project?.id]);

  const title = draft.trim();
  const canSend = Boolean(project) && title.length >= 3 && !busy;
  const branchList = Array.from(new Set([project?.defaultBranch ?? "main", ...branches]));

  const submit = async (e?: SyntheticEvent) => {
    e?.preventDefault();
    if (!canSend || !project) return;
    setBusy(true);
    setError(null);
    try {
      const run = await startRun(project.id, { title, branch, budgetUsd: budget });
      setDraft("");
      navigate(`/p/${project.slug}/r/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the run. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) void submit(e);
  };

  const close = () => setMenu(null);
  const toggle = (m: Exclude<Menu, null>) => setMenu((cur) => (cur === m ? null : m));

  return (
    <div className="cp-wrap">
      <form className="cp" onSubmit={submit}>
        <label htmlFor="composer-input" className="sr-only">
          What should Orca build?
        </label>
        <textarea
          id="composer-input"
          ref={textRef}
          rows={3}
          value={draft}
          placeholder={project ? "Describe a feature, a fix or a refactor…" : "Choose a project, then describe what to build…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="cp-bar">
          <button
            ref={projectChip}
            className={project ? "cp-chip" : "cp-chip cp-chip-ghost"}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menu === "project"}
            onClick={() => toggle("project")}
          >
            {project ? <ProjectGlyph project={project} /> : <PlusIcon />}
            <span className="cp-chip-text">{project ? project.name : "Choose project"}</span>
            {project && <CaretIcon />}
          </button>
          {project && (
            <button
              ref={branchChip}
              className="cp-chip"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={menu === "branch"}
              aria-label={`Start from branch ${branch}`}
              onClick={() => toggle("branch")}
            >
              <BranchIcon />
              <span className="cp-chip-text mono">{branch}</span>
              <CaretIcon />
            </button>
          )}
          <button
            ref={budgetChip}
            className="cp-chip"
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menu === "budget"}
            aria-label={`Spend limit $${budget}`}
            onClick={() => toggle("budget")}
          >
            <CoinIcon />
            <span className="cp-chip-text">${budget} limit</span>
            <CaretIcon />
          </button>
          <button className="cp-send" type="submit" disabled={!canSend} aria-label="Start run">
            {busy ? <span className="spinner" /> : <ArrowUpIcon />}
          </button>
        </div>
      </form>
      {error && <Notice tone="error">{error}</Notice>}

      {menu === "project" && (
        <Popover anchor={projectChip} onClose={close} label="Choose a project">
          <ProjectMenu
            projects={projects}
            selectedId={project?.id}
            onClose={close}
            onChoose={(p) => {
              close();
              onSelectProject(p);
            }}
            onAdded={onSelectProject}
          />
        </Popover>
      )}
      {menu === "branch" && (
        <Popover anchor={branchChip} onClose={close} label="Start from branch">
          <div className="pm">
            <div className="pm-head">
              <span>Start from branch</span>
            </div>
            {branchList.map((b) => (
              <button
                key={b}
                className="pm-item"
                type="button"
                onClick={() => {
                  setBranch(b);
                  close();
                }}
              >
                <span className="pm-icon">
                  <BranchIcon />
                </span>
                <span className="pm-text">
                  <span className="pm-name mono">{b}</span>
                </span>
                {b === branch ? (
                  <span className="pm-end pm-check">
                    <CheckIcon />
                  </span>
                ) : (
                  <span />
                )}
              </button>
            ))}
            <p className="pm-foot">The run starts from this branch.</p>
          </div>
        </Popover>
      )}
      {menu === "budget" && (
        <Popover anchor={budgetChip} onClose={close} label="Spend limit">
          <div className="pm">
            <div className="pm-head">
              <span>Spend limit for this run</span>
            </div>
            {RUN_BUDGET_CHOICES_USD.map((b) => (
              <button
                key={b}
                className="pm-item"
                type="button"
                onClick={() => {
                  setBudget(b);
                  close();
                }}
              >
                <span className="pm-icon">
                  <CoinIcon />
                </span>
                <span className="pm-text">
                  <span className="pm-name">${b}</span>
                </span>
                {b === budget ? (
                  <span className="pm-end pm-check">
                    <CheckIcon />
                  </span>
                ) : (
                  <span />
                )}
              </button>
            ))}
            <p className="pm-foot">The most this run may spend on model usage.</p>
          </div>
        </Popover>
      )}
    </div>
  );
}
