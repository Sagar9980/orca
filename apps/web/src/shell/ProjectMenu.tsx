import { useState } from "react";
import type { Project } from "@orca/shared";
import { ProviderIcon } from "../auth/ui";
import { BackIcon, ChevronIcon, FolderIcon } from "../components/icons";
import { desktop } from "../lib/desktop";
import { useShell } from "./context";
import { Menu, MenuBack, MenuHead, MenuItem, MenuNote, MenuSeparator } from "./Popover";

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
      <Menu>
        <MenuHead>
          <MenuBack onClick={() => setView("list")}>
            <BackIcon />
            Back
          </MenuBack>
          <span>GitHub</span>
        </MenuHead>
        <MenuNote>
          Connecting GitHub repos is coming next. Until then, clone the repo to your computer and add it with{" "}
          <b>Open folder</b>.
        </MenuNote>
      </Menu>
    );
  }

  return (
    <Menu role="menu">
      <MenuHead>
        <span>{projects.length ? "Projects" : "Add a project"}</span>
      </MenuHead>
      {projects.map((p) => (
        <MenuItem
          key={p.id}
          role="menuitem"
          icon={<ProjectGlyph project={p} />}
          name={p.name}
          sub={projectLocation(p)}
          checked={p.id === selectedId}
          onClick={() => onChoose(p)}
        />
      ))}
      {projects.length > 0 && <MenuSeparator />}
      <MenuItem
        role="menuitem"
        icon={<FolderIcon />}
        name="Open folder…"
        sub={!desktop && "Only in the Orca desktop app"}
        disabled={!desktop}
        onClick={openFolder}
      />
      <MenuItem
        role="menuitem"
        icon={<ProviderIcon provider="github" />}
        name="Connect GitHub repo…"
        end={<ChevronIcon />}
        onClick={() => setView("github")}
      />
    </Menu>
  );
}
