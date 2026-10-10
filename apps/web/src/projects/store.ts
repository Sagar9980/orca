import { useSyncExternalStore } from "react";
import type { CreateLocalProjectInput, CreateRunInput, FolderInfo, Project, RunSummary } from "@orca/shared";
import { api } from "../lib/api";
import { getDevice } from "../lib/desktop";

// The signed-in user's projects and runs, shared by the sidebar, start screens and workspace.

interface State {
  projects: Project[];
  loaded: boolean;
  error: string | null;
}

let state: State = { projects: [], loaded: false, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useProjects(): State {
  return useSyncExternalStore(subscribe, () => state);
}

let inflight: Promise<void> | null = null;
/** Bumped by resetProjects, so a refresh that was already running can't write its results afterwards. */
let generation = 0;

export function refreshProjects(): Promise<void> {
  if (inflight) return inflight;
  const gen = generation;
  const request: Promise<void> = api<{ projects: Project[] }>("/api/projects")
    .then(({ projects }) => {
      if (gen === generation) set({ projects, loaded: true, error: null });
    })
    .catch((err: Error) => {
      if (gen === generation) set({ loaded: true, error: err.message });
    })
    .finally(() => {
      if (inflight === request) inflight = null;
    });
  inflight = request;
  return request;
}

/** Forget everything, e.g. after sign-out, so the next user never sees the last one's projects. */
export function resetProjects() {
  generation++;
  inflight = null;
  set({ projects: [], loaded: false, error: null });
}

export const findProject = (slug: string) => state.projects.find((p) => p.slug === slug);

/** Connects a folder the user picked in the desktop app. */
export async function addLocalProject(folder: FolderInfo): Promise<Project> {
  const device = await getDevice();
  if (!device) throw new Error("Folders can only be added from the Orca desktop app.");
  const input: CreateLocalProjectInput = {
    source: "local",
    name: folder.name,
    path: folder.path,
    defaultBranch: folder.branch ?? "main",
    githubRepo: folder.githubRepo,
    device,
  };
  const { project } = await api<{ project: Project }>("/api/projects", { method: "POST", body: input });
  set({ projects: [project, ...state.projects] });
  return project;
}

export async function removeProject(id: string): Promise<void> {
  await api(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  set({ projects: state.projects.filter((p) => p.id !== id) });
}

export async function startRun(projectId: string, input: CreateRunInput): Promise<RunSummary> {
  const { run } = await api<{ run: RunSummary }>(`/api/projects/${encodeURIComponent(projectId)}/runs`, {
    method: "POST",
    body: input,
  });
  set({
    projects: state.projects.map((p) => (p.id === projectId ? { ...p, runs: [run, ...p.runs] } : p)),
  });
  return run;
}
