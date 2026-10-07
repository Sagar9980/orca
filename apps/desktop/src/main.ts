import { app, BrowserWindow } from "electron";
import path from "node:path";

const DEV_URL = process.env.ORCA_DEV_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Orca",
    backgroundColor: "#08131c",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "../../web/dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
