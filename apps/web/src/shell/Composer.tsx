import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { DEFAULT_RUN_BUDGET_USD, RUN_BUDGET_CHOICES_USD, type Project } from "@orca/shared";
import { Notice } from "../auth/ui";
import { ArrowUpIcon, BranchIcon, CaretIcon, CheckIcon, CoinIcon, PlusIcon } from "../components/icons";
import { Spinner } from "../components/ui/spinner";
import { cn } from "../lib/utils";
import { desktop } from "../lib/desktop";
import { readPref, writePref } from "../lib/hooks";
import { navigate } from "../router";
import { startRun } from "../projects/store";
import { Menu, MenuHead, MenuItem, MenuNote, Popover } from "./Popover";
import { ProjectGlyph, ProjectMenu } from "./ProjectMenu";

interface Props {
  projects: Project[];
  project: Project | undefined;
  onSelectProject: (project: Project) => void;
}

type OpenMenu = "project" | "branch" | "budget" | null;

/** A setting under the text box: project, branch, spend limit. */
const chip =
  "inline-flex h-[30px] max-w-full items-center gap-[7px] rounded-[9px] border bg-panel px-2.5 text-[12.5px] text-foreground hover:border-border-strong aria-expanded:border-primary [&_svg]:size-[13px] [&_svg]:shrink-0 [&_svg]:text-muted-foreground [&>svg:last-child:not(:first-child)]:size-2.5 [&>svg:last-child:not(:first-child)]:text-faint";
const chipText = "min-w-0 truncate";

/** "What should Orca build?" box. Starting a run creates it on the server and opens its workspace. */
export function Composer({ projects, project, onSelectProject }: Props) {
  const [draft, setDraft] = useState("");
  const [branch, setBranch] = useState(project?.defaultBranch ?? "main");
  const [branches, setBranches] = useState<string[]>([]);
  const [budget, setBudget] = useState<number>(DEFAULT_RUN_BUDGET_USD);
  // Worktree (the default): the agent works in a separate copy on its own orca/run-* branch. Off: it works live in
  // the project folder on the branch the folder is on, and leaves its changes there uncommitted.
  const [worktree, setWorktree] = useState(() => readPref("orca-worktree") !== "off");
  /** The branch the project folder is on now; a run without a worktree works on it. */
  const [current, setCurrent] = useState<string | null>(null);
  const [menu, setMenu] = useState<OpenMenu>(null);
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
    setCurrent(null);
    if (!desktop || !project?.folder) return;
    let live = true;
    desktop
      .inspectFolder(project.folder)
      .then((info) => {
        if (!live || !info) return;
        setBranches(info.branches);
        setCurrent(info.branch);
      })
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
  // The worktree choice only matters for a real run on a folder on this computer.
  const local = Boolean(desktop && project?.folder);
  const inFolder = local && !worktree;
  const runBranch = inFolder ? (current ?? branch) : branch;

  const submit = async (e?: SyntheticEvent) => {
    e?.preventDefault();
    if (!canSend || !project) return;
    setBusy(true);
    setError(null);
    try {
      const run = await startRun(project.id, { title, branch: runBranch, budgetUsd: budget, worktree: !inFolder });
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
  const toggle = (m: Exclude<OpenMenu, null>) => setMenu((cur) => (cur === m ? null : m));

  return (
    <div className="flex flex-col gap-2.5">
      <form
        className="rounded-[18px] border border-border-strong bg-card shadow-[0_24px_50px_-36px_rgba(0,0,0,0.6)] transition-[border-color,box-shadow] duration-150 focus-within:border-[color-mix(in_oklab,var(--color-primary)_60%,var(--color-border-strong))] focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_12%,transparent),0_24px_50px_-36px_rgba(0,0,0,0.6)]"
        onSubmit={submit}
      >
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
          className="block max-h-[260px] min-h-[84px] w-full resize-none bg-transparent px-[18px] pt-4 pb-1.5 text-[15.5px] leading-normal text-foreground placeholder:text-faint focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2 pb-2.5">
          <button
            ref={projectChip}
            className={cn(chip, !project && "border-dashed text-primary [&_svg]:text-primary")}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menu === "project"}
            onClick={() => toggle("project")}
          >
            {project ? <ProjectGlyph project={project} /> : <PlusIcon />}
            <span className={chipText}>{project ? project.name : "Choose project"}</span>
            {project && <CaretIcon />}
          </button>
          {project && (
            <button
              ref={branchChip}
              className={chip}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={menu === "branch"}
              aria-label={inFolder ? `Works on your folder's branch, ${runBranch}` : `Start from branch ${branch}`}
              title={inFolder ? "Without a worktree, the run works on the branch your folder is on." : undefined}
              disabled={inFolder}
              onClick={() => toggle("branch")}
            >
              <BranchIcon />
              <span className={cn(chipText, "font-mono text-xs")}>{runBranch}</span>
              {!inFolder && <CaretIcon />}
            </button>
          )}
          {local && (
            <button
              className={cn(chip, "[&_svg]:text-primary-foreground")}
              type="button"
              role="switch"
              aria-checked={worktree}
              title={
                worktree
                  ? "On: the agent works in a separate worktree on its own orca/run-* branch, and your folder isn't touched."
                  : "Off: the agent works live in your folder on its current branch, and leaves the changes uncommitted for you."
              }
              onClick={() => {
                setWorktree(!worktree);
                writePref("orca-worktree", worktree ? "off" : "on");
              }}
            >
              <span
                className={cn(
                  "grid size-[15px] place-items-center rounded-[4px] border border-border-strong [&_svg]:size-[11px]!",
                  worktree && "border-primary bg-primary",
                )}
                aria-hidden="true"
              >
                {worktree && <CheckIcon />}
              </span>
              <span className={chipText}>Worktree</span>
            </button>
          )}
          <button
            ref={budgetChip}
            className={chip}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menu === "budget"}
            aria-label={`Spend limit $${budget}`}
            onClick={() => toggle("budget")}
          >
            <CoinIcon />
            <span className={chipText}>${budget} limit</span>
            <CaretIcon />
          </button>
          <button
            className="ml-auto grid size-[34px] flex-none place-items-center rounded-[10px] bg-primary p-0 text-primary-foreground disabled:bg-border-strong disabled:text-faint disabled:opacity-100 [&_svg]:size-4"
            type="submit"
            disabled={!canSend}
            aria-label="Start run"
          >
            {busy ? <Spinner /> : <ArrowUpIcon />}
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
          <Menu>
            <MenuHead>
              <span>Start from branch</span>
            </MenuHead>
            {branchList.map((b) => (
              <MenuItem
                key={b}
                icon={<BranchIcon />}
                name={b}
                mono
                checked={b === branch}
                onClick={() => {
                  setBranch(b);
                  close();
                }}
              />
            ))}
            <MenuNote quiet>The run starts from this branch.</MenuNote>
          </Menu>
        </Popover>
      )}
      {menu === "budget" && (
        <Popover anchor={budgetChip} onClose={close} label="Spend limit">
          <Menu>
            <MenuHead>
              <span>Spend limit for this run</span>
            </MenuHead>
            {RUN_BUDGET_CHOICES_USD.map((b) => (
              <MenuItem
                key={b}
                icon={<CoinIcon />}
                name={"$" + b}
                checked={b === budget}
                onClick={() => {
                  setBudget(b);
                  close();
                }}
              />
            ))}
            <MenuNote quiet>The most this run may spend on model usage.</MenuNote>
          </Menu>
        </Popover>
      )}
    </div>
  );
}
