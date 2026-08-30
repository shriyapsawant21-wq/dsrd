import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { startApiServer, type StartedApiServer } from "@dsrd/api/server";
import { createWindowOptions, isAllowedNavigation } from "./window-policy.js";

const rendererUrl = process.env.DSRD_RENDERER_URL ?? "http://127.0.0.1:5173";
const preloadPath = fileURLToPath(new URL("./preload.cjs", import.meta.url));

let mainWindow: BrowserWindow | undefined;
let apiServer: StartedApiServer | undefined;
let apiShutdown: Promise<void> | undefined;
let quitAfterShutdown = false;

async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow(createWindowOptions(preloadPath));
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedNavigation(targetUrl, rendererUrl)) event.preventDefault();
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  window.once("ready-to-show", () => window.show());

  await window.loadURL(rendererUrl);
}

async function closeApi(): Promise<void> {
  if (!apiServer) return;
  apiShutdown ??= apiServer.close();
  await apiShutdown;
  apiServer = undefined;
}

app.enableSandbox();

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quitAfterShutdown || !apiServer) return;
  event.preventDefault();
  void closeApi().finally(() => {
    quitAfterShutdown = true;
    app.quit();
  });
});

try {
  await app.whenReady();
  apiServer = await startApiServer();
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow().catch((error) => {
        console.error("Failed to recreate DSRD window", error);
      });
    }
  });
} catch (error) {
  console.error("Failed to start DSRD desktop", error);
  await closeApi().catch(() => undefined);
  app.exit(1);
}
