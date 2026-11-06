import type { ClientCommand, DeviceInfo, FolderInfo, RunEvent } from "@orca/shared";

/** What the page asks the desktop app to run. */
export interface DesktopRunInput {
  runId: string;
  title: string;
  /** The project folder on this computer. */
  folder: string;
  /** Branch the run starts from. */
  branch: string;
  budgetUsd: number;
}

/** What the desktop app's preload script exposes. Absent in a normal browser. */
export interface DesktopBridge {
  device(): Promise<DeviceInfo>;
  /** Opens the system folder picker. Null when the user cancels. */
  chooseFolder(): Promise<FolderInfo | null>;
  inspectFolder(folder: string): Promise<FolderInfo | null>;
  /** Only works on a folder picked with chooseFolder in this session. */
  initGit(folder: string): Promise<FolderInfo>;
  /** The run's events so far; none if it hasn't started in this app session. */
  runAttach(runId: string): Promise<RunEvent[]>;
  /** Starts a real agent run, unless it is already going. Returns its events so far. */
  runStart(input: DesktopRunInput): Promise<RunEvent[]>;
  runCommand(command: ClientCommand): Promise<void>;
  /** Events of every run in this app; returns a function that stops listening. */
  onRunEvent(listener: (event: RunEvent) => void): () => void;
}

declare global {
  interface Window {
    orca?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | null = window.orca ?? null;

let devicePromise: Promise<DeviceInfo | null> | null = null;

/** This computer, when running in the desktop app. */
export function getDevice(): Promise<DeviceInfo | null> {
  devicePromise ??= desktop ? desktop.device().catch(() => null) : Promise.resolve(null);
  return devicePromise;
}

/** Electron's IPC wraps errors as "Error invoking remote method 'x': Error: message". */
export function bridgeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}
