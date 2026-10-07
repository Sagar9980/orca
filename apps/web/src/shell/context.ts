import { createContext, useContext } from "react";
import type { Project } from "@orca/shared";

export type Tone = "error" | "info" | "success";

export interface ShellActions {
  toast(message: string, tone?: Tone): void;
  /** Runs the desktop folder picker and connects the folder. Null when cancelled or it failed (a toast says why). */
  addFolder(): Promise<Project | null>;
  closeDrawer(): void;
  openDrawer(): void;
}

export const ShellContext = createContext<ShellActions | null>(null);

export function useShell(): ShellActions {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used inside <Shell>.");
  return shell;
}
