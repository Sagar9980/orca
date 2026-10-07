import { useState } from "react";
import type { Project } from "@orca/shared";
import { ProviderIcon } from "../auth/ui";
import { BackIcon, CheckIcon, ChevronIcon, FolderIcon } from "../components/icons";
import { desktop } from "../lib/desktop";
import { useShell } from "./context";

interface Props {
  projects: Project[];
  selectedId?: string;
  onChoose: (project: Project) => void;
  onAdded: (project: Project) => void;
  onClose: () => void;
}

/** Where a project lives, as one short line. */
export function projectLocation(p: Project): string {
  if (p.folder) return p.folder.replace(/^\/Users\/[^/]+/, "~");
  if (p.source === "github" && p.githubRepo) return p.githubRepo;
  return "Not on this computer";
}

export const ProjectGlyph = ({ project }: { project: Project }) =>
  project.source === "github" ? <ProviderIcon provider="github" /> : <FolderIcon />;

/** Pick a project, or add one from a folder or GitHub. Used by the composer chip and the sidebar's +. */
export function ProjectMenu({ projects, selectedId, onChoose, onAdded, onClose }: Props) {
  const shell = useShell();
  const [view, setView] = useState<"list" | "github">("list");

  const openFolder = async () => {
    onClose();
    const project = await shell.addFolder();
    if (project) onAdded(project);
  };

  if (view === "github") {
    return (
      <div className="pm">
        <div className="pm-head">
          <button className="pm-back" type="button" onClick={() => setView("list")}>
            <BackIcon />
            Back
          </button>
          <span>GitHub</span>
        </div>
        <p className="pm-note">
          Connecting GitHub repos is coming next. Until then, clone the repo to your computer and add it with{" "}
          <b>Open folder</b>.
        </p>
      </div>
    );
  }

  return (
    <div className="pm" role="menu">
      <div className="pm-head">
        <span>{projects.length ? "Projects" : "Add a project"}</span>
      </div>
      {projects.map((p) => (
        <button key={p.id} className="pm-item" type="button" role="menuitem" onClick={() => onChoose(p)}>
          <span className="pm-icon">
            <ProjectGlyph project={p} />
          </span>
          <span className="pm-text">
            <span className="pm-name">{p.name}</span>
            <span className="pm-sub">{projectLocation(p)}</span>
          </span>
          {p.id === selectedId ? (
            <span className="pm-end pm-check">
              <CheckIcon />
            </span>
          ) : (
            <span />
          )}
        </button>
      ))}
      {projects.length > 0 && <div className="pm-sep" role="separator" />}
      <button className="pm-item" type="button" role="menuitem" disabled={!desktop} onClick={openFolder}>
        <span className="pm-icon">
          <FolderIcon />
        </span>
        <span className="pm-text">
          <span className="pm-name">Open folder…</span>
          {!desktop && <span className="pm-sub">Only in the Orca desktop app</span>}
        </span>
        <span />
      </button>
      <button className="pm-item" type="button" role="menuitem" onClick={() => setView("github")}>
        <span className="pm-icon">
          <ProviderIcon provider="github" />
        </span>
        <span className="pm-text">
          <span className="pm-name">Connect GitHub repo…</span>
        </span>
        <span className="pm-end">
          <ChevronIcon />
        </span>
      </button>
    </div>
  );
}
