# Web Folder Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the React dashboard submit a complete Compose project folder to the API and show real streamed run progress and evidence without changing the debugger algorithm.

**Architecture:** The browser sends selected folder files and a parallel JSON array of normalized browser-relative paths. The API validates and materializes those files in a temporary directory, resolves one conventional Compose filename, and passes that file to the existing `RunService`. Existing `createProductionDiscoveryRunner`, `ComposeExecutionPlatform`, scheduler, proof oracle, `RunStore`, and SSE endpoints remain the execution path.

**Tech Stack:** React 19, Vite, TypeScript, Express 5, Multer, Vitest, Supertest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-30-web-folder-integration-design.md`

## Global Constraints

- Do not change `packages/scheduler`, `packages/runtime`, `packages/proof`, or `packages/contracts`.
- Do not change candidate generation, minimization, replay, runtime timeouts, Docker lifecycle policy, or the deterministic failure oracle.
- Only conventional root filenames are Compose targets: `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`.
- Browser paths must be normalized relative paths: no absolute path, `..`, empty path component, duplicate destination, or NUL byte.
- The API must report an invalid upload before it creates a `RunStore` record.

---

## File Structure

- Create `packages/api/src/project-upload.ts`: validate uploaded relative paths, create a temporary project directory, write files, and resolve the unique conventional Compose file.
- Create `packages/api/src/project-upload.test.ts`: unit tests for safe materialization and target detection.
- Modify `packages/api/src/app.ts`: replace the one-file Multer route with folder upload wiring; leave other routes and `RunService` unchanged.
- Modify `packages/api/src/app.test.ts`: verify accepted folder upload, input rejection, and initial SSE progress.
- Modify `packages/web/src/api.ts`: serialize selected folder files plus their relative paths and subscribe to all live SSE event names.
- Create `packages/web/src/api.test.ts`: test multipart folder request construction and initial SSE event delivery using mocked browser APIs.
- Modify `packages/web/src/App.tsx`: provide a folder picker and pass its `FileList` into the API client.
- Modify `packages/web/src/styles.css`: add only the small selected-folder label styles required by the new control.

### Task 1: Safe Project-Upload Boundary

**Files:**
- Create: `packages/api/src/project-upload.ts`
- Create: `packages/api/src/project-upload.test.ts`

**Interfaces:**
- Consumes: `Express.Multer.File[]`, `node:fs/promises`, `node:path`, `node:os`.
- Produces: `materializeComposeProject(files: Express.Multer.File[], relativePathsJson: unknown): Promise<{ projectDirectory: string; composeFile: string }>`.
- Errors: throws exact, user-safe messages for malformed paths and missing/ambiguous Compose files; `app.ts` maps these errors to HTTP 400.

- [ ] **Step 1: Write failing unit tests for a valid project and invalid paths**

```ts
import { afterEach, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { materializeComposeProject } from "./project-upload.js";

const created: string[] = [];
afterEach(async () => { await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

it("materializes a Compose project while preserving relative build files", async () => {
  const result = await materializeComposeProject([
    { buffer: Buffer.from("services: { api: { build: . } }") },
    { buffer: Buffer.from("FROM node:20-alpine") }
  ] as Express.Multer.File[], JSON.stringify(["demo/compose.yaml", "demo/Dockerfile"]));
  created.push(result.projectDirectory);
  expect(result.composeFile).toMatch(/demo[\\/]compose\.yaml$/);
  await expect(readFile(result.composeFile, "utf8")).resolves.toContain("build: .");
});

it("rejects traversal, duplicate paths, and missing Compose targets", async () => {
  await expect(materializeComposeProject([{ buffer: Buffer.from("x") }] as Express.Multer.File[], JSON.stringify(["../compose.yaml"]))).rejects.toThrow("Invalid project file path");
  await expect(materializeComposeProject([{ buffer: Buffer.from("x") }, { buffer: Buffer.from("y") }] as Express.Multer.File[], JSON.stringify(["a.txt", "a.txt"]))).rejects.toThrow("Duplicate project file path");
  await expect(materializeComposeProject([{ buffer: Buffer.from("x") }] as Express.Multer.File[], JSON.stringify(["Dockerfile"]))).rejects.toThrow("No Compose file found");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/api/src/project-upload.test.ts`

Expected: FAIL because `project-upload.ts` does not exist.

- [ ] **Step 3: Implement the narrow materialization helper**

```ts
const composeNames = new Set(["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"]);

export async function materializeComposeProject(files: Express.Multer.File[], relativePathsJson: unknown) {
  const paths = parseRelativePaths(relativePathsJson, files.length);
  const projectDirectory = await mkdtemp(join(tmpdir(), "dsrd-web-run-"));
  const destinations = new Set<string>();
  for (const [index, relativePath] of paths.entries()) {
    const destination = resolveSafeDestination(projectDirectory, relativePath);
    if (!destinations.add(destination)) throw new Error("Duplicate project file path");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, files[index].buffer);
  }
  const matches = paths.filter((path) => composeNames.has(basename(path)));
  if (matches.length !== 1) throw new Error(matches.length ? "Multiple Compose files found; keep one conventional Compose file at the project root" : "No Compose file found in project folder");
  return { projectDirectory, composeFile: resolveSafeDestination(projectDirectory, matches[0]) };
}
```

`parseRelativePaths` must parse a JSON string into one string per uploaded file. `resolveSafeDestination` must normalize `/` to the host separator and reject a path that is absolute, contains `..`, has an empty component, includes `\0`, or resolves outside `projectDirectory`.

- [ ] **Step 4: Run focused API helper tests**

Run: `npx vitest run packages/api/src/project-upload.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the boundary**

```powershell
git add packages/api/src/project-upload.ts packages/api/src/project-upload.test.ts
git commit -m "feat: materialize uploaded compose projects"
```

### Task 2: Wire Folder Upload Into the Existing Run API

**Files:**
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/app.test.ts`

**Interfaces:**
- Consumes: `materializeComposeProject(req.files, req.body.relativePaths)` from Task 1.
- Produces: unchanged `POST /api/runs` response `{ runId, status: "queued" }`; unchanged run/report/failure routes.
- Preserves: `RunService.start(run.id, composeFile)` and existing SSE terminal event names.

- [ ] **Step 1: Write failing API tests for project upload and initial SSE**

```ts
it("starts a run from a folder upload", async () => {
  const store = new RunStore();
  let received = "";
  const app = createApp(store, new RunService(store, async (composeFile) => { received = composeFile; return { status: "no_failure" }; }));
  const response = await request(app).post("/api/runs")
    .field("relativePaths", JSON.stringify(["demo/compose.yaml", "demo/Dockerfile"]))
    .attach("projectFiles", Buffer.from("services: {}"), "compose.yaml")
    .attach("projectFiles", Buffer.from("FROM node:20-alpine"), "Dockerfile");
  expect(response.status).toBe(202);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(received).toMatch(/demo[\\/]compose\.yaml$/);
});

it("writes the current exploring state as the first SSE event", async () => {
  const store = new RunStore(); const run = store.create();
  store.publish(run.id, { ...run.progress, phase: "exploring", percentage: 10, message: "Exploring schedules" });
  const app = createApp(store, new RunService(store, async () => ({ status: "no_failure" })));
  const response = await request(app).get(`/api/runs/${run.id}/events`).buffer(true).parse((res, callback) => {
    res.setEncoding("utf8"); let text = ""; res.on("data", (chunk) => { text += chunk; res.destroy(); callback(null, text); });
  });
  expect(response.text).toContain("event: progress");
  expect(response.text).toContain("Exploring schedules");
});
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `npx vitest run packages/api/src/app.test.ts`

Expected: FAIL because the route accepts only `composeFile` and does not accept `projectFiles` plus `relativePaths`.

- [ ] **Step 3: Replace only the route's upload boundary**

```ts
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2_000_000, files: 200 } });

app.post("/api/runs", upload.array("projectFiles", 200), async (req, res) => {
  try {
    const files = req.files;
    if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: "Select a project folder containing one Compose file" });
    const { composeFile } = await materializeComposeProject(files, req.body.relativePaths);
    const run = store.create();
    void service.start(run.id, composeFile);
    return res.status(202).json({ runId: run.id, status: "queued" });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid project upload" });
  }
});
```

Keep `GET /api/runs/:runId/events`'s immediate `write(run.progress)` behavior. It already emits nonterminal state as `event: progress`; the browser fix is in Task 3.

- [ ] **Step 4: Run API tests and typecheck**

Run: `npx vitest run packages/api && npm run typecheck --workspace=@dsrd/api`

Expected: PASS.

- [ ] **Step 5: Commit the API wiring**

```powershell
git add packages/api/src/app.ts packages/api/src/app.test.ts
git commit -m "feat: accept compose project folders through api"
```

### Task 3: Send Folder Contents and Consume All SSE Progress in the Web Client

**Files:**
- Modify: `packages/web/src/api.ts`
- Create: `packages/web/src/api.test.ts`

**Interfaces:**
- Consumes: `FileList | File[]`, `file.webkitRelativePath`, `FormData`, `EventSource`.
- Produces: `createRun(files: Iterable<File>): Promise<{ runId: string }>` and `subscribeRun` that handles `progress`, `completed`, `no_failure`, and `error`.
- API contract: multipart field `projectFiles`; JSON field `relativePaths` in matching order.

- [ ] **Step 1: Write failing browser-client tests**

```ts
it("posts folder files with their browser-relative paths", async () => {
  const file = new File(["services: {}"], "compose.yaml");
  Object.defineProperty(file, "webkitRelativePath", { value: "demo/compose.yaml" });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ runId: "run-1" }) });
  vi.stubGlobal("fetch", fetchMock);
  await createRun([file]);
  const form = fetchMock.mock.calls[0][1].body as FormData;
  expect(form.get("relativePaths")).toBe(JSON.stringify(["demo/compose.yaml"]));
  expect(form.getAll("projectFiles")).toHaveLength(1);
});

it("delivers the API's initial progress event", () => {
  const source = new FakeEventSource(); vi.stubGlobal("EventSource", source.constructor);
  const received: Progress[] = [];
  const unsubscribe = subscribeRun("run-1", (event) => received.push(event), vi.fn());
  source.emit("progress", { phase: "exploring", percentage: 10 });
  expect(received[0]).toMatchObject({ phase: "exploring", percentage: 10 });
  unsubscribe();
});
```

`FakeEventSource` should save callbacks registered by `addEventListener`, expose `emit(name, value)`, and record whether `close()` was called.

- [ ] **Step 2: Run the web API test to verify it fails**

Run: `npx vitest run packages/web/src/api.test.ts`

Expected: FAIL because `createRun` currently accepts one `File`, uses `composeFile`, and omits the initial `progress` listener.

- [ ] **Step 3: Implement only request serialization and event subscription**

```ts
type FolderFile = File & { webkitRelativePath?: string };

export async function createRun(files: Iterable<File>): Promise<{ runId: string }> {
  const selected = [...files];
  const paths = selected.map((file) => (file as FolderFile).webkitRelativePath || file.name);
  const body = new FormData();
  body.append("relativePaths", JSON.stringify(paths));
  selected.forEach((file) => body.append("projectFiles", file));
  const response = await fetch("/api/runs", { method: "POST", body });
  if (!response.ok) throw new Error((await response.json()).error ?? "Upload failed");
  return response.json();
}

const eventNames = ["progress", "completed", "no_failure", "error"] as const;
eventNames.forEach((name) => source.addEventListener(name, (event) => onEvent(JSON.parse((event as MessageEvent).data))));
```

- [ ] **Step 4: Run focused web client tests and typecheck**

Run: `npx vitest run packages/web/src/api.test.ts && npm run typecheck --workspace=@dsrd/web`

Expected: PASS.

- [ ] **Step 5: Commit the web transport change**

```powershell
git add packages/web/src/api.ts packages/web/src/api.test.ts
git commit -m "feat: upload web project folders with live progress"
```

### Task 4: Expose the Folder Picker in the Dashboard

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/styles.css`

**Interfaces:**
- Consumes: `createRun(files)` from Task 3.
- Produces: a folder-only picker with a readable selected-folder name and the existing exploring/report/error flow.

- [ ] **Step 1: Add the folder selection state and control**

```tsx
const [selectedFolder, setSelectedFolder] = useState("");
const selectFolder = (files?: FileList | null) => {
  if (!files?.length) return;
  const first = files[0] as File & { webkitRelativePath?: string };
  setSelectedFolder((first.webkitRelativePath ?? first.name).split("/")[0]);
  void start(files);
};

<input
  ref={input}
  className="sr-only"
  aria-label="Compose project folder"
  type="file"
  {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
  onChange={(event) => selectFolder(event.target.files)}
/>
{selectedFolder && <p className="selected-folder">PROJECT: {selectedFolder}</p>}
```

Update `start` to accept `Iterable<File>` and reject an empty selection rather than checking one filename extension. Replace the landing-copy references to “Compose file” with “Compose project folder.” Keep report/detail screen behavior unchanged.

- [ ] **Step 2: Add minimal selected-folder styling**

```css
.selected-folder {
  margin: 0.75rem 0 0;
  color: var(--accent);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
}
```

- [ ] **Step 3: Build the web app and inspect the resulting UI**

Run: `npm run build --workspace=@dsrd/web`

Expected: PASS, with no TypeScript error for the folder-picker attributes.

- [ ] **Step 4: Commit the dashboard control**

```powershell
git add packages/web/src/App.tsx packages/web/src/styles.css
git commit -m "feat: select compose project folders in dashboard"
```

### Task 5: Full Verification and Demo Handoff

**Files:**
- Modify only if verification exposes a direct integration defect in files from Tasks 1–4.

**Interfaces:**
- Verifies the same `POST /api/runs` → SSE → report flow used by the dashboard.

- [ ] **Step 1: Run the full deterministic test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run typechecks and builds**

Run: `npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 3: Start the live API and web servers in separate terminals**

Run in terminal 1: `npm run dev:api`

Run in terminal 2: `npm run dev:web`

Expected: API listens on `http://127.0.0.1:4317`; Vite serves the dashboard at `http://localhost:5173`.

- [ ] **Step 4: Run the real folder-upload demo with Docker available**

Select the directory containing the golden fixture's conventional Compose file from the dashboard. Confirm that the dashboard receives `SCANNING_SCHEDULES` updates, reaches a terminal state, and, when a race is found, its report and timeline are returned by the API rather than fallback data.

If the fixture requires a known race schedule, use the existing CLI/replay artifact for demonstration; do not alter the scheduler's candidate generation or runtime timeout to make the web integration pass.

- [ ] **Step 5: Commit any focused verification fix and report commands**

```powershell
git status --short
git log --oneline origin/dev..HEAD
```

Expected: only the design, plan, and focused integration commits are ahead of `origin/dev`.
