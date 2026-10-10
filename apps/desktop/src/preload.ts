import { contextBridge, ipcRenderer } from "electron";

// The only desktop features the web app can reach. Each call is checked again in the main process.
contextBridge.exposeInMainWorld("orca", {
  device: () => ipcRenderer.invoke("orca:device"),
  chooseFolder: () => ipcRenderer.invoke("orca:choose-folder"),
  inspectFolder: (folder: string) => ipcRenderer.invoke("orca:inspect-folder", folder),
  initGit: (folder: string) => ipcRenderer.invoke("orca:init-git", folder),
});
