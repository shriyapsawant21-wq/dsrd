# Electron Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, demo-ready Electron desktop shell that runs the existing Vite UI and Express API through `npm run dev:desktop`.

**Architecture:** Extract API listener startup into a reusable lifecycle function, then call it from both the existing API executable and Electron's main process. Electron loads the Vite renderer, exposes only platform metadata through a sandboxed preload, and coordinates Vite plus Electron with portable npm tooling.

**Tech Stack:** Electron, TypeScript, React/Vite, Express, Vitest, concurrently, wait-on, cross-env

**Spec:** `docs/superpowers/specs/2026-08-31-electron-desktop-design.md`

## Global Constraints

- Preserve all existing CLI and browser-app commands and behavior.
- Use `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Do not expose filesystem, shell, Docker, process execution, or arbitrary IPC to the renderer.
- Do not add installer signing, auto-updates, or cross-platform release packaging in this pass.
- Do not duplicate scheduler, runtime, proof, API, or renderer logic.

---

### Task 1: Reusable API Server Lifecycle

**Files:**
- Create: `packages/api/src/server.ts`
- Create: `packages/api/src/server.test.ts`
- Modify: `packages/api/src/main.ts`
- Modify: `packages/api/package.json`

**Interfaces:**
- Produces: `startApiServer(options?: { host?: string; port?: number }): Promise<StartedApiServer>`.
- Produces: `StartedApiServer` with `url: string`, `port: number`, and `close(): Promise<void>`.
- Consumes: existing `createApp`, `RunStore`, `RunService`, and `createProductionDiscoveryRunner`.

- [ ] **Step 1: Write the failing lifecycle test**

```ts
import { describe, expect, it } from "vitest";
import { startApiServer } from "./server.js";

describe("startApiServer", () => {
  it("listens on an ephemeral loopback port and closes cleanly", async () => {
    const api = await startApiServer({ port: 0 });
    try {
      expect(api.url).toBe(`http://127.0.0.1:${api.port}`);
      const response = await fetch(`${api.url}/api/runs/missing`);
      expect(response.status).toBe(404);
    } finally {
      await api.close();
    }
    await expect(fetch(`${api.url}/api/runs/missing`)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run packages/api/src/server.test.ts`

Expected: FAIL because `packages/api/src/server.ts` does not exist.

- [ ] **Step 3: Implement the minimal lifecycle**

Create `server.ts` with a Promise-wrapped Express listener, derive the actual port from `server.address()`, reject startup errors, and wrap `server.close()` in a Promise. Update `main.ts` to await the function and log its returned URL. Export `./server` from `packages/api/package.json` with matching declaration and JavaScript paths.

- [ ] **Step 4: Verify GREEN and API regression coverage**

Run: `npx vitest run packages/api`

Expected: all API tests pass.

- [ ] **Step 5: Commit**

```powershell
git add packages/api
git commit -m feat-api-server-lifecycle
```

### Task 2: Secure Electron Main and Preload Boundary

**Files:**
- Create: `packages/desktop/package.json`
- Create: `packages/desktop/tsconfig.json`
- Create: `packages/desktop/src/window-policy.test.ts`
- Create: `packages/desktop/src/window-policy.ts`
- Create: `packages/desktop/src/preload.ts`
- Create: `packages/desktop/src/main.ts`

**Interfaces:**
- Consumes: `startApiServer` from `@dsrd/api/server`.
- Produces: `createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions`.
- Produces: `isAllowedNavigation(targetUrl: string, rendererUrl: string): boolean`.
- Produces: renderer global `window.dsrdDesktop.platform` containing only the host platform string.

- [ ] **Step 1: Add the failing window-policy test**

```ts
import { describe, expect, it } from "vitest";
import { createWindowOptions, isAllowedNavigation } from "./window-policy.js";

describe("desktop window policy", () => {
  it("keeps the renderer isolated from Node", () => {
    const options = createWindowOptions("C:/app/preload.js");
    expect(options.webPreferences).toMatchObject({
      preload: "C:/app/preload.js",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  });

  it("allows only navigation within the renderer origin", () => {
    const renderer = "http://127.0.0.1:5173";
    expect(isAllowedNavigation(`${renderer}/failures`, renderer)).toBe(true);
    expect(isAllowedNavigation("https://example.com", renderer)).toBe(false);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run packages/desktop/src/window-policy.test.ts`

Expected: FAIL because `window-policy.ts` does not exist.

- [ ] **Step 3: Implement window policy, preload, and main process**

Implement `window-policy.ts` as pure functions. In `preload.ts`, expose an immutable `{ platform: process.platform }` object through `contextBridge`. In `main.ts`, await `app.whenReady()`, start the API, create one `BrowserWindow`, block new windows and external-origin navigation, load `DSRD_RENDERER_URL`, recreate the window on activation, and close the API exactly once during quit. Log startup errors and exit non-zero.

- [ ] **Step 4: Add the desktop workspace configuration**

Use NodeNext TypeScript output from `src` to `dist`. Add `electron` as a development dependency and `@dsrd/api` as a workspace dependency. Define `build`, `typecheck`, and `dev` scripts. The `dev` script must coordinate Vite and Electron using `concurrently`, `wait-on`, and `cross-env` and terminate both processes when either fails.

- [ ] **Step 5: Install dependencies and verify GREEN**

Run: `npm install`

Run: `npx vitest run packages/desktop`

Expected: both desktop policy tests pass.

- [ ] **Step 6: Verify desktop compilation**

Run: `npm run typecheck --workspace=@dsrd/desktop`

Run: `npm run build --workspace=@dsrd/desktop`

Expected: both commands exit zero.

- [ ] **Step 7: Commit**

```powershell
git add package-lock.json packages/desktop
git commit -m feat-electron-shell
```

### Task 3: Root Integration, Documentation, and Launch Verification

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `packages/desktop/package.json`

**Interfaces:**
- Produces: root command `npm run dev:desktop`.
- Preserves: `npm run dev:api`, `npm run dev:web`, and `node packages/scheduler/dist/main.js`.

- [ ] **Step 1: Add a failing integration assertion**

Extend `packages/desktop/src/window-policy.test.ts` to read the root and desktop package manifests and assert that the root exposes `dev:desktop`, the script builds execution/API/desktop before delegating to the desktop workspace, and the desktop workspace starts Vite plus Electron.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run packages/desktop/src/window-policy.test.ts`

Expected: FAIL because the root `dev:desktop` script is absent.

- [ ] **Step 3: Add the root command and usage documentation**

Add `dev:desktop` to the root scripts. Document prerequisites and the single startup command in `README.md`, including that Docker Desktop must be running for Compose projects and that `Ctrl+C` stops the development session.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run packages/desktop`

Expected: all desktop tests pass.

- [ ] **Step 5: Run full static and automated verification**

Run: `npm test`

Run: `npm run typecheck`

Run: `npm run build`

Expected: all tests pass and both validation commands exit zero.

- [ ] **Step 6: Launch smoke test**

Run: `npm run dev:desktop`

Expected: Vite reports `http://127.0.0.1:5173`, Electron opens the DSRD UI, and `http://127.0.0.1:4317/api/runs/missing` returns HTTP 404. Stop with `Ctrl+C` and confirm ports 4317 and 5173 have no processes from the smoke test.

- [ ] **Step 7: Commit**

```powershell
git add package.json README.md packages/desktop
git commit -m feat-desktop-dev-command
```

