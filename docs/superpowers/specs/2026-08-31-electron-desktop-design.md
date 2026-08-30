# Electron Desktop Design

## Goal

Add a demo-ready Electron desktop shell that runs the existing DSRD React interface and Express debugging API from one command without duplicating scheduler, runtime, proof, CLI, or UI behavior.

## Scope

The implementation adds an `@dsrd/desktop` workspace and a root `npm run dev:desktop` command. The command builds the required TypeScript packages, starts the Vite development server, waits for it to become reachable, and launches Electron. The browser app and CLI remain available through their existing commands.

This pass does not include a signed installer, auto-updates, application signing, or cross-platform release validation.

## Architecture

Electron has three boundaries:

1. The main process owns the native window and starts the existing Express API on `127.0.0.1:4317`.
2. A minimal preload script exposes only immutable desktop metadata through `contextBridge`; it does not expose Node.js or arbitrary IPC to the renderer.
3. The renderer is the existing Vite/React application loaded from `http://127.0.0.1:5173` during development.

The API startup logic moves from a side-effect-only entry point into a reusable `startApiServer` function. The normal API entry point and Electron main process both call that function, so desktop and browser modes execute the same production discovery pipeline.

## Lifecycle

`npm run dev:desktop` builds the API dependencies and desktop TypeScript, then runs Vite and Electron together. Electron waits for the renderer URL before creating the window. Closing the final window closes the API listener; quitting Electron performs the same cleanup. On macOS-style activation, the window can be recreated while the API remains available until application quit.

Startup errors are logged and terminate Electron with a non-zero exit code instead of presenting an empty window. External navigation is denied by default, and renderer-created windows are blocked.

## Security

The BrowserWindow uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. The preload surface contains no filesystem, process, shell, Docker, or arbitrary message access. All project data continues through the existing validated multipart API.

## Testing

Tests cover reusable API server startup/cleanup and pure desktop window configuration/navigation policy. Existing API, web, scheduler, runtime, proof, fixture, typecheck, and production-build checks remain mandatory. A launch smoke test verifies that Electron reaches the Vite renderer in development without leaving background processes running.

## Dependencies

The desktop workspace uses Electron for the runtime, `concurrently` to coordinate Vite and Electron, `wait-on` to gate window startup, and `cross-env` for portable development environment variables.
