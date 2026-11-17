import { useEffect, useState } from "react";
import type { BranchChanges, LandAction, Run } from "@orca/shared";
import { bridgeError, desktop, type RunBranch } from "../lib/desktop";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { BranchIcon } from "./icons";

/** The diff of one file, cut from the branch's whole patch. */
function filePatch(patch: string, file: string): string {
  const block = patch.split(/^(?=diff --git )/m).find((b) => b.startsWith("diff --git ") && b.includes(` b/${file}\n`));
  return block?.slice(block.indexOf("@@")) ?? "";
}

/**
 * A finished run's branch: what it changed, and merge, push for a pull request, or discard. What the user picked
 * comes back as a run event (`landed` on the run), so it reads the same after a restart.
 */
export function ReviewPanel({ run, branch }: { run: Run; branch: RunBranch }) {
  const [changes, setChanges] = useState<BranchChanges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<LandAction | null>(null);
  const [sure, setSure] = useState(false);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const live = Boolean(run.workBranch);

  useEffect(() => {
    if (!desktop || !live) return;
    let current = true;
    desktop.runChanges(branch).then(
      (c) => current && setChanges(c),
      (err) => current && setError(bridgeError(err)),
    );
    return () => {
      current = false;
    };
  }, [branch.runId, live]);

  const land = (action: LandAction) => {
    if (!desktop) return;
    setBusy(action);
    setError(null);
    desktop
      .runLand(branch, action)
      .catch((err) => setError(bridgeError(err)))
      .finally(() => {
        setBusy(null);
        setSure(false);
      });
  };

  const added = changes?.files.reduce((n, f) => n + f.added, 0) ?? 0;
  const removed = changes?.files.reduce((n, f) => n + f.removed, 0) ?? 0;

  return (
    <section className="mx-auto mb-5 max-w-[1480px] rounded-xl border bg-panel text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <span className="text-faint [&_svg]:size-3.5">
          <BranchIcon />
        </span>
        <div className="min-w-0 flex-1">
          {run.landed && <span className="font-medium">{run.landed.note} </span>}
          {run.landed?.url && (
            <a href={run.landed.url} target="_blank" rel="noreferrer" className="text-primary underline">
              Open pull request
            </a>
          )}
          {live && !run.landed && (
            <span className="text-muted-foreground">
              {changes ? (
                <>
                  {changes.files.length} {changes.files.length === 1 ? "file" : "files"},{" "}
                  <span className="text-success">+{added}</span> <span className="text-destructive">−{removed}</span> in{" "}
                  {changes.commits.length} {changes.commits.length === 1 ? "commit" : "commits"} on{" "}
                  <b className="font-mono text-xs font-medium text-foreground">{run.workBranch}</b>
                </>
              ) : (
                "Loading changes…"
              )}
            </span>
          )}
        </div>
        {live && (
          <div className="flex flex-none gap-2">
            <Button size="sm" disabled={!!busy} onClick={() => land("merge")}>
              {busy === "merge" ? "Merging…" : `Merge into ${branch.base}`}
            </Button>
            {run.landed?.action !== "push" && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => land("push")}>
                {busy === "push" ? "Pushing…" : "Push & open PR"}
              </Button>
            )}
            <Button
              size="sm"
              variant={sure ? "destructive" : "ghost"}
              disabled={!!busy}
              onClick={() => (sure ? land("discard") : setSure(true))}
              onBlur={() => setSure(false)}
            >
              {sure ? "Delete branch?" : "Discard"}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="border-t px-4 py-2.5 text-destructive">{error}</p>}
      {live && changes && changes.files.length > 0 && (
        <div className="border-t px-2 py-1.5">
          {changes.commits.length > 1 && (
            <ul className="mb-1 px-2 py-1 text-xs text-muted-foreground">
              {changes.commits.map((c) => (
                <li key={c.sha}>
                  <span className="font-mono text-faint">{c.sha}</span> {c.subject}
                </li>
              ))}
            </ul>
          )}
          {changes.files.map((f) => (
            <div key={f.path}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-md px-2 py-1 text-left font-mono text-xs hover:bg-card"
                onClick={() => setOpenFile(openFile === f.path ? null : f.path)}
              >
                <span className="min-w-0 flex-1 truncate">{f.path}</span>
                <span className="text-success">+{f.added}</span>
                <span className="text-destructive">−{f.removed}</span>
              </button>
              {openFile === f.path && (
                <pre className="mx-2 mb-2 max-h-[420px] overflow-auto rounded-md border bg-card py-2 font-mono text-[11.5px] leading-[1.5]">
                  {filePatch(changes.patch, f.path)
                    .split("\n")
                    .map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          "px-3 whitespace-pre",
                          line.startsWith("+") && "bg-success/10 text-success",
                          line.startsWith("-") && "bg-destructive/10 text-destructive",
                          line.startsWith("@@") && "text-faint",
                        )}
                      >
                        {line || " "}
                      </div>
                    ))}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
