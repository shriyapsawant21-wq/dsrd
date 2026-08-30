import type { BrowserWindowConstructorOptions } from "electron/main";

export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#000000",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}

export function isAllowedNavigation(targetUrl: string, rendererUrl: string): boolean {
  try {
    return new URL(targetUrl).origin === new URL(rendererUrl).origin;
  } catch {
    return false;
  }
}
