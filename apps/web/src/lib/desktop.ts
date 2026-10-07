import type { DeviceInfo, FolderInfo } from "@orca/shared";

/** What the desktop app's preload script exposes. Absent in a normal browser. */
export interface DesktopBridge {
  device(): Promise<DeviceInfo>;
  /** Opens the system folder picker. Null when the user cancels. */
  chooseFolder(): Promise<FolderInfo | null>;
  inspectFolder(folder: string): Promise<FolderInfo | null>;
  /** Only works on a folder picked with chooseFolder in this session. */
  initGit(folder: string): Promise<FolderInfo>;
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
