import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from "electron";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { initRepo, inspectFolder, isDirectory } from "./folders";

const DEV_URL = process.env.ORCA_DEV_URL;

/** Folders the user picked in the system dialog this session. Only these can be changed (git init). */
const pickedFolders = new Set<string>();

/** The windows Orca opened. createWindow keeps each one on Orca's page. */
const orcaWindows = new WeakSet<WebContents>();

function isOrcaUrl(url: string): boolean {
  if (DEV_URL) return url.startsWith(new URL(DEV_URL).origin + "/");
  return url.startsWith("file://");
}

/** Only Orca's own page may use the bridge: the top frame of an Orca window, never an iframe or another page. */
function fromOrca(event: IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  return orcaWindows.has(event.sender) && !!frame && frame.parent === null && isOrcaUrl(frame.url);
}

function openInBrowser(url: string) {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
}

function guard<A extends unknown[], R>(handler: (event: IpcMainInvokeEvent, ...args: A) => Promise<R> | R) {
  return (event: IpcMainInvokeEvent, ...args: A) => {
    if (!fromOrca(event)) throw new Error("Not allowed.");
    return handler(event, ...args);
  };
}

/** A random id kept in the app's data folder, so the server can tell this computer's folders apart. */
function deviceId(): string {
  const file = path.join(app.getPath("userData"), "device.json");
  try {
    const saved = JSON.parse(readFileSync(file, "utf8")) as { id?: unknown };
    if (typeof saved.id === "string" && saved.id.length >= 8) return saved.id;
  } catch {
    // First launch, or the file is unreadable: make a new id.
  }
  const id = randomUUID();
  writeFileSync(file, JSON.stringify({ id }));
  return id;
}

function deviceName(): string {
  return os.hostname().replace(/\.local$/, "") || "This computer";
}

function registerBridge() {
  const id = deviceId();

  ipcMain.handle(
    "orca:device",
    guard(() => ({ id, name: deviceName(), platform: process.platform })),
  );

  ipcMain.handle(
    "orca:choose-folder",
    guard(async (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        title: "Choose a project folder",
        properties: ["openDirectory", "createDirectory"],
      };
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      const folder = result.canceled ? undefined : result.filePaths[0];
      if (!folder) return null;
      pickedFolders.add(folder);
      return inspectFolder(folder);
    }),
  );

  // Read-only: reports git details for a folder Orca already knows, e.g. to list its branches.
  ipcMain.handle(
    "orca:inspect-folder",
    guard(async (_event, folder: unknown) => {
      if (typeof folder !== "string" || !path.isAbsolute(folder) || !(await isDirectory(folder))) return null;
      return inspectFolder(folder);
    }),
  );

  ipcMain.handle(
    "orca:init-git",
    guard(async (_event, folder: unknown) => {
      if (typeof folder !== "string" || !pickedFolders.has(folder)) throw new Error("Choose the folder first.");
      if (!(await initRepo(folder))) throw new Error("git init failed. Check that git is installed.");
      return inspectFolder(folder);
    }),
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: "Orca",
    backgroundColor: "#08131c",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  orcaWindows.add(win.webContents);
  // The bridge trusts whatever page this window shows, so it never leaves Orca's page
  // (e.g. for a file dropped onto it). Web links open in the browser instead.
  win.webContents.on("will-navigate", (event, url) => {
    // In dev, social sign-in goes to the provider and back in this window; fromOrca still checks the origin.
    if (DEV_URL && /^https?:\/\//.test(url)) return;
    event.preventDefault();
    openInBrowser(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: "deny" };
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "../../web/dist/index.html"));
  }
}

app.whenReady().then(() => {
  registerBridge();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
