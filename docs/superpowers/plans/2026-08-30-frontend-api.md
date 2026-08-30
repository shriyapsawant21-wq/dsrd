# DSRD Frontend and Local API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a React UI and local Express API that execute and visualize real DSRD discovery runs.

**Architecture:** `packages/api` adapts `ExecutionPlatform`, scheduler orchestration, and `FailureArtifact` behind local HTTP/SSE endpoints. `packages/web` is a Vite React client that uses those endpoints only and renders the supplied cyberpunk design.

**Tech Stack:** TypeScript, Node.js, Express, Multer, Vite, React, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-30-frontend-api-design.md`

## Global Constraints

- Keep failure classification owned by existing deterministic proof code.
- Accept one `.yaml`/`.yml` Compose upload; reject all other files.
- API is local and unauthenticated.
- Web package must not import scheduler/runtime/proof directly.
- SSE is the sole live-progress transport.
- Use the supplied `C:/Users/Shriya Sawant/Downloads/image.png` as the web logo.

---

### Task 1: Scaffold packages and shared API DTOs

**Files:** Create `packages/api/package.json`, `packages/api/tsconfig.json`, `packages/api/src/contracts.ts`, `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`, `packages/web/src/main.tsx`.

**Interfaces:** `RunStatus = "queued" | "exploring" | "completed" | "no_failure" | "error"`; `ProgressEvent` has `runId`, `phase`, `percentage`, `message`, `testedSchedules`, `failureCount`; `RunSummary` includes optional `artifact` and `failure`.

- [ ] **Step 1: Write failing type/import tests**

```ts
import { expectTypeOf, it } from "vitest";
import type { ProgressEvent } from "./contracts.js";
it("defines progress events", () => expectTypeOf<ProgressEvent>().toMatchTypeOf<{ percentage: number }>());
```

- [ ] **Step 2: Verify red** — `npx vitest run packages/api/src/contracts.test.ts` fails because API package is absent.
- [ ] **Step 3: Add minimal workspace package manifests, TypeScript configs, DTOs, and Vite entry point.** Add root scripts `dev:api` and `dev:web`.
- [ ] **Step 4: Verify green** — run targeted API test and `npm run typecheck`.
- [ ] **Step 5: Commit** — `git commit -m "feat: scaffold web and local API packages"`.

### Task 2: API run store and scheduler adapter

**Files:** Create `packages/api/src/run-store.ts`, `packages/api/src/run-service.ts`, and their tests.

**Interfaces:** `RunStore.create(): RunRecord`; `RunStore.publish(runId, event)`; `RunService.start(runId, composeFile): Promise<void>`; injected `ExecutionPlatform` runs real `discover`, `generateCandidates`, and `discoverFailure`.

- [ ] **Step 1: Write failing transition test**

```ts
it("stores a completed artifact from the injected platform", async () => {
  const run = store.create();
  await service.start(run.id, "fixture.yaml");
  expect(store.get(run.id)?.status).toBe("completed");
});
```

- [ ] **Step 2: Verify red** — `npx vitest run packages/api/src/run-service.test.ts` fails because service is absent.
- [ ] **Step 3: Implement state transitions and progress publication.** Map discovered artifacts to `failure-1`; map deterministic no-failure separately; catch execution errors as `error`.
- [ ] **Step 4: Verify green** — run API service tests.
- [ ] **Step 5: Commit** — `git commit -m "feat: add deterministic API run service"`.

### Task 3: Express upload, SSE, report, and detail endpoints

**Files:** Create `packages/api/src/app.ts`, `packages/api/src/main.ts`, `packages/api/src/app.test.ts`.

**Interfaces:** `createApp({ runService, runStore, uploadRoot })` implements the five spec routes. `POST /api/runs` returns 202 `{runId,status}`; SSE sends named `progress` events and terminal event types; report is attachment JSON.

- [ ] **Step 1: Write failing HTTP tests**

```ts
it("rejects a non-Compose upload", async () => {
  const response = await request(app).post("/api/runs").attach("composeFile", Buffer.from("x"), "logs.txt");
  expect(response.status).toBe(400);
});
it("returns 409 before a report exists", async () => {
  expect((await request(app).get("/api/runs/run-1/report")).status).toBe(409);
});
```

- [ ] **Step 2: Verify red** — `npx vitest run packages/api/src/app.test.ts` fails because app is absent.
- [ ] **Step 3: Implement Multer upload validation, isolated run directories, CORS for Vite dev, SSE headers/subscriptions, 404/409 responses, and JSON report attachment.**
- [ ] **Step 4: Verify green** — run endpoint tests.
- [ ] **Step 5: Commit** — `git commit -m "feat: expose local DSRD run API"`.

### Task 4: React API client, state machine, and upload/exploring views

**Files:** Create `packages/web/src/api.ts`, `packages/web/src/App.tsx`, `packages/web/src/App.test.tsx`, `packages/web/src/styles.css`; copy logo to `packages/web/public/dsrd-logo.png`.

**Interfaces:** `createRun(file)`, `subscribeRun(runId, callbacks)`, `getRun`, `getFailure`, `reportUrl`; `App` transitions `landing → upload → exploring → report | no_failure | error`.

- [ ] **Step 1: Write failing UI test**

```tsx
it("uploads a selected Compose file and shows exploration progress", async () => {
  render(<App api={fakeApi} />);
  await userEvent.upload(screen.getByLabelText(/compose file/i), new File(["services: {}"], "compose.yaml"));
  expect(await screen.findByText(/exploring/i)).toBeVisible();
});
```

- [ ] **Step 2: Verify red** — `npx vitest run packages/web/src/App.test.tsx` fails because app is absent.
- [ ] **Step 3: Implement API client and views.** Use the supplied logo image in a centered, sticky CSS landing treatment; add reduced-motion handling; show SSE percentage, phase, schedules, and failures.
- [ ] **Step 4: Verify green** — run web UI tests.
- [ ] **Step 5: Commit** — `git commit -m "feat: add DSRD upload and exploration UI"`.

### Task 5: Report and timeline detail UI

**Files:** Modify `packages/web/src/App.tsx`, `packages/web/src/styles.css`, `packages/web/src/App.test.tsx`.

- [ ] **Step 1: Write failing report/detail tests**

```tsx
it("opens deterministic failure timeline from the report", async () => {
  render(<App api={fakeCompletedApi} />);
  await userEvent.click(await screen.findByRole("button", { name: /failure-1/i }));
  expect(await screen.findByText(/trace:/i)).toBeVisible();
  expect(screen.getByText(/db_connection_failed/i)).toBeVisible();
});
```

- [ ] **Step 2: Verify red** — targeted web test fails because report/detail views do not exist.
- [ ] **Step 3: Implement neon terminal report table, report download anchor, detail timeline, highlighted failure event, schedule evidence, back navigation, and API/no-failure/error states.**
- [ ] **Step 4: Verify green** — `npx vitest run packages/web/src/App.test.tsx`.
- [ ] **Step 5: Commit** — `git commit -m "feat: add failure report and timeline UI"`.

### Task 6: End-to-end developer workflow and verification

**Files:** Modify `README.md`, root `package.json`.

- [ ] **Step 1: Write failing documentation test** asserting README includes `npm run dev:api`, `npm run dev:web`, and Compose upload guidance.
- [ ] **Step 2: Verify red** — targeted test fails before README update.
- [ ] **Step 3: Document two-terminal local startup, `fixtures/startup-race/compose.yaml` upload, report download, and the one-Compose-file constraint.**
- [ ] **Step 4: Verify green** — run `npm test`, `npm run typecheck`, `npm run build`; launch API and Vite app, upload the fixture in a browser, and verify live exploration plus report/detail/download.
- [ ] **Step 5: Commit** — `git commit -m "docs: document local DSRD web workflow"`.

## Plan Self-Review

- Tasks 1–3 implement the API boundary and real backend adapter; Tasks 4–5 implement the referenced visual flow; Task 6 supplies executable demo documentation and end-to-end checks.
- No shared contract is modified; the API translates existing contracts to frontend DTOs.
- Every production unit begins with a focused failing test and has a targeted green verification.
