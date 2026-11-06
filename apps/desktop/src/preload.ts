import { contextBridge, ipcRenderer } from "electron";

// The only desktop features the web app can reach. Each call is checked again in the main process.
contextBridge.exposeInMainWorld("orca", {
  device: () => ipcRenderer.invoke("orca:device"),
  chooseFolder: () => ipcRenderer.invoke("orca:choose-folder"),
  inspectFolder: (folder: string) => ipcRenderer.invoke("orca:inspect-folder", folder),
  initGit: (folder: string) => ipcRenderer.invoke("orca:init-git", folder),
  runAttach: (runId: string) => ipcRenderer.invoke("orca:run-attach", runId),
  runStart: (input: unknown) => ipcRenderer.invoke("orca:run-start", input),
  runCommand: (command: unknown) => ipcRenderer.invoke("orca:run-command", command),
  /** Returns a function that stops listening. */
  onRunEvent: (listener: (event: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, runEvent: unknown) => listener(runEvent);
    ipcRenderer.on("orca:run-event", handler);
    return () => ipcRenderer.removeListener("orca:run-event", handler);
  },
});
