# Web Folder Integration Design

## Goal

Connect the existing React dashboard to the existing API and Compose discovery
path so a user can select a complete Compose project folder and receive live
progress, a real failure report, and timeline evidence. This change must not
change schedule generation, search, minimization, replay, the Docker runtime
policy, or the proof oracle.

## Scope

- Replace the web API's single-file Compose upload with a project-folder upload.
- Materialize the uploaded files in an isolated temporary project directory.
- Detect one Compose file in that directory and pass its path to the existing
  production discovery runner.
- Keep the current API run record, SSE stream, report endpoint, and failure
  detail endpoint as the UI boundary.
- Make the web client handle the server's initial and subsequent live progress
  events consistently.

Out of scope: changing the scheduler candidate set, timeout rules, Docker
execution behavior, failure classification, replay behavior, or shared
contracts.

## Data Flow

```text
Browser folder picker
  -> multipart files with browser-relative paths
  -> API validation and safe temporary-directory materialization
  -> Compose file detection
  -> existing createProductionDiscoveryRunner(composeFile)
  -> existing ComposeExecutionPlatform + scheduler + proof observer
  -> existing RunStore / SSE stream
  -> dashboard progress, report, and evidence screens
```

The runner receives a Compose file inside its original project layout, so
relative Compose references such as `build: .`, `env_file`, and Dockerfile
paths resolve exactly as they do for the existing CLI directory workflow.

## Browser Input

The landing screen provides a folder picker. The browser includes each selected
file and its relative path in `FormData`; the client sends it to `POST
/api/runs`. The UI shows the selected folder name before starting the run.

The demo path intentionally uses browser upload rather than a typed local path:
a browser cannot safely grant an API arbitrary filesystem access on the user's
machine.

## API Materialization and Validation

`POST /api/runs` accepts a bounded set of uploaded files. For each file, the API
accepts only a normalized relative path: no absolute paths, `..` traversal,
empty segments, or duplicate destinations. It writes the files below a new
temporary run directory.

After materialization, the API searches for exactly one supported Compose file:
`compose.yml`, `compose.yaml`, `docker-compose.yml`, or `docker-compose.yaml`.
If none or more than one are found, it returns a clear 400 error before creating
a run. The accepted Compose file is handed unchanged to the existing run
service.

## Progress and Terminal States

The SSE route retains its current event protocol. The client subscribes to the
server's initial `progress` event as well as terminal events. It renders the
current run state immediately and continues to receive progress published by
the production runner after each existing schedule execution.

On completion, the client retrieves the run record and shows its real artifact
data. The report and detail views continue to use their existing API endpoints.
No hardcoded demo evidence is used when the API returns a real artifact.

## Errors

The UI displays actionable errors for an empty selection, invalid folder
contents, a missing/ambiguous Compose file, rejected path, upload limit, or
runtime error. A runtime error remains distinct from a discovered startup race;
only the deterministic existing oracle can produce a failure artifact.

## Verification

- API unit/integration tests: safe folder materialization, Compose-file
  detection, missing/ambiguous Compose errors, and SSE initial progress.
- Web tests: folder selection request and consumption of initial/terminal SSE
  events.
- Existing typechecks and package tests remain green.
- A real Docker fixture run, when Docker is available, verifies that `build: .`
  works through the UI/API directory materialization path.

## Files Expected to Change

- `packages/api/src/app.ts` and API tests: multipart folder intake and safe
  materialization.
- `packages/web/src/App.tsx` and `packages/web/src/api.ts`: folder picker and
  upload/SSE integration.
- Focused API/web tests only. `packages/scheduler`, `packages/runtime`,
  `packages/proof`, and `packages/contracts` are intentionally unchanged.
