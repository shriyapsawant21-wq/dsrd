# Web Target Auto-Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect Compose and local-process project folders in the web API and run each via its existing platform adapter.

**Architecture:** The materializer returns a shared `TargetConfig`; `RunService` forwards it to a production runner that uses `createDefaultPlatform()` and the existing `generateCandidates`/`discoverFailure` pipeline.

**Tech Stack:** TypeScript, Express, Multer, Vitest, existing scheduler/runtime/proof packages.

**Spec:** `docs/superpowers/specs/2026-08-30-web-target-autodetection-design.md`

## Global Constraints

- Do not change contracts, scheduler, runtime, proof, candidates, delays, minimization, replay, or oracle behavior.
- Accept exactly one Compose target or exactly one `manifest.json`; reject missing and ambiguous targets before creating a run.

---

### Task 1: Detect Uploaded Target

**Files:**
- Modify: `packages/api/src/project-upload.ts`
- Modify: `packages/api/src/project-upload.test.ts`

**Interfaces:** `materializeProject(files, relativePathsJson)` returns `{ projectDirectory, target: TargetConfig }`.

- [ ] **Step 1: Write failing tests**

```ts
it("materializes a local-process project", async () => {
  const project = await materializeProject([uploadedFile('{"workloads": []}')], JSON.stringify(["race/manifest.json"]));
  createdDirectories.push(project.projectDirectory);
  expect(project.target).toMatchObject({ platform: "local-process", manifestPath: expect.stringMatching(/manifest\.json$/) });
});
it("rejects ambiguous project targets", async () => {
  await expect(materializeProject([uploadedFile("services: {}"), uploadedFile("{}")], JSON.stringify(["compose.yaml", "manifest.json"]))).rejects.toThrow("Multiple project targets found");
});
```

- [ ] **Step 2: Verify red**

Run: `npx vitest run packages/api/src/project-upload.test.ts`

Expected: FAIL because the helper only finds Compose files.

- [ ] **Step 3: Implement target detection**

```ts
const manifestFiles = relativePaths.filter((path) => basename(path) === "manifest.json");
const composeFiles = relativePaths.filter((path) => composeNames.has(basename(path)));
if (composeFiles.length + manifestFiles.length === 0) throw new Error("No supported project target found");
if (composeFiles.length > 1 || manifestFiles.length > 1 || (composeFiles.length && manifestFiles.length)) throw new Error("Multiple project targets found; keep one Compose file or one manifest.json");
const target = composeFiles.length ? { platform: "compose" as const, composeFile: resolveSafeDestination(projectDirectory, composeFiles[0]) } : { platform: "local-process" as const, manifestPath: resolveSafeDestination(projectDirectory, manifestFiles[0]) };
return { projectDirectory, target };
```

- [ ] **Step 4: Verify green and commit**

Run: `npx vitest run packages/api/src/project-upload.test.ts`

Expected: PASS.

```powershell
git add packages/api/src/project-upload.ts packages/api/src/project-upload.test.ts
git commit -m "feat: detect uploaded project targets"
```

### Task 2: Forward Target to Existing Platform Router

**Files:**
- Modify: `packages/api/src/run-service.ts`, `packages/api/src/run-service.test.ts`
- Modify: `packages/api/src/app.ts`, `packages/api/src/app.test.ts`
- Modify: `packages/api/src/production.ts`

**Interfaces:** `DiscoveryRunner = (target: TargetConfig, onProgress) => Promise<...>`; `RunService.start(runId, target)`; API calls `service.start(run.id, target)`.

- [ ] **Step 1: Write failing forwarding tests**

```ts
it("forwards a local target to discovery", async () => {
  const target = { platform: "local-process" as const, manifestPath: "manifest.json" };
  const store = new RunStore(); const run = store.create(); let received: TargetConfig | undefined;
  await new RunService(store, async (nextTarget) => { received = nextTarget; return { status: "no_failure" }; }).start(run.id, target);
  expect(received).toEqual(target);
});
```

- [ ] **Step 2: Verify red**

Run: `npx vitest run packages/api/src/run-service.test.ts packages/api/src/app.test.ts`

Expected: FAIL because `RunService` currently accepts a Compose-file string.

- [ ] **Step 3: Reuse the CLI router**

```ts
const platform = createDefaultPlatform();
const workloads = await platform.discover(target);
const candidates = generateCandidates(workloads, delayOptionsMs).slice(0, 36);
const result = await discoverFailure({ candidates, delayOptionsMs, target, runSchedule: async (runTarget, schedule) => {
  const result = await platform.run(runTarget, schedule); onProgress(++testedSchedules, candidates.length); return result;
}});
```

Keep the existing completion mapping, progress calculation, endpoint paths, and SSE protocol unchanged.

- [ ] **Step 4: Verify API and commit**

Run: `npx vitest run packages/api && npm run typecheck --workspace=@dsrd/api`

Expected: PASS.

```powershell
git add packages/api/src/run-service.ts packages/api/src/run-service.test.ts packages/api/src/app.ts packages/api/src/app.test.ts packages/api/src/production.ts
git commit -m "feat: route web projects to existing platforms"
```

### Task 3: Verify Both Existing Project Types

- [ ] **Step 1: Run full verification**

Run: `npm test && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 2: Live check**

Start `npm run dev:api` and `npm run dev:web`, select `fixtures/local-startup-race`, and verify the page leaves upload, streams progress, and reaches an existing terminal state.
