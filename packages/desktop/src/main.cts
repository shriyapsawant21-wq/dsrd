const { app, BrowserWindow }: typeof import("electron/main") = require("electron");
const { join }: typeof import("node:path") = require("node:path");

type StartedApiServer = import("@dsrd/api/server").StartedApiServer;
type WindowPolicy = typeof import("./window-policy.js");

const rendererUrl = process.env.DSRD_RENDERER_URL ?? "http://127.0.0.1:5173";
const preloadPath = join(__dirname, "preload.cjs");

let mainWindow: InstanceType<typeof BrowserWindow> | undefined;
let apiServer: StartedApiServer | undefined;
let apiShutdown: Promise<void> | undefined;
let quitAfterShutdown = false;
let windowPolicy: WindowPolicy | undefined;

async function createMainWindow(): Promise<void> {
  if (!windowPolicy) throw new Error("Desktop window policy is not loaded");

  const window = new BrowserWindow(windowPolicy.createWindowOptions(preloadPath));
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!windowPolicy?.isAllowedNavigation(targetUrl, rendererUrl)) event.preventDefault();
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

async function bootstrap(): Promise<void> {
  try {
    const [apiModule, policyModule] = await Promise.all([
      import("@dsrd/api/server"),
      import("./window-policy.js"),
    ]);
    windowPolicy = policyModule;

    await app.whenReady();
    apiServer = await apiModule.startApiServer();
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
}

void bootstrap();
