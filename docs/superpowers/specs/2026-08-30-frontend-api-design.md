# DSRD Frontend and Local API Design

## Goal

Build a local web interface for DSRD that lets a user upload a Docker Compose file, observe real startup-race exploration, inspect deterministic failure evidence, download the replay report, and open a detailed timeline.

## Scope

This feature adds a Vite React frontend and a small Node/Express HTTP API. The API adapts the existing scheduler, runtime, proof, and contracts packages; it does not duplicate candidate generation, Docker lifecycle control, failure classification, minimization, or replay logic.

The user-supplied logo at `C:/Users/Shriya Sawant/Downloads/image.png` is copied into the web app as the canonical DSRD logo asset.

## Packages

### `packages/api`

An Express server exposes a local API for one-user development and demo use. A `RunStore` owns run state and isolated temporary upload directories. A `RunService` converts an uploaded Compose file to a `TargetConfig`, obtains workloads from the existing compose execution platform, generates schedules using the existing scheduler package, calls its discovery/minimization orchestration, and saves the returned `FailureArtifact`.

`RunService` emits structured, non-authoritative lifecycle/progress events. The existing proof result remains the only source of `pass`/`fail` classification.

### `packages/web`

A Vite React TypeScript app communicates only through an API client module. It contains page components for upload, exploration, report, and timeline detail, plus a persistent shell/navbar. It must not import runtime, scheduler, Docker, or proof packages directly.

## HTTP API

### Create a run

`POST /api/runs`

Accept multipart form data with one `composeFile` field. Only `.yaml` and `.yml` files are accepted. The server stores the upload in an isolated run directory, creates a run record, starts the asynchronous search, and returns:

```json
{ "runId": "run_...", "status": "queued" }
```

### Stream progress

`GET /api/runs/:runId/events`

Returns Server-Sent Events. Each event contains a run ID, phase, percentage, message, schedules tested, and failure count. Events are lifecycle/progress UI evidence only. Terminal event types are `completed`, `no_failure`, and `error`.

### Read run state

`GET /api/runs/:runId`

Returns the current status plus result summary. Completed race discoveries expose failure rows derived from `FailureArtifact.events` and `expectedFailureReason`; no-failure and execution-error states are distinct.

### Download report

`GET /api/runs/:runId/report`

Returns the saved `FailureArtifact` as an attachment. It returns 409 until a race discovery has completed and 404 for an unknown run.

### Read failure detail

`GET /api/runs/:runId/failures/:failureId`

Returns the selected failure’s deterministic reason, original/minimized schedules, and ordered `TimelineEvent[]`. MVP creates one failure row per discovered artifact using ID `failure-1`.

## Frontend Interaction Flow

1. Landing opens with the provided neon logo centered at large scale on a black canvas.
2. Scrolling to the application section reduces the logo and anchors it in the top-left of the fixed navbar. The navbar appears on every application view.
3. The initialize screen presents a drag-and-drop/click-to-browse Compose YAML picker. Selecting a valid file immediately creates a run.
4. The exploring screen connects to SSE, displays progress/phase/schedules/failures from received events, and transitions from a terminal SSE event to the report screen.
5. The report screen displays discovered failures, supports report download, and links each failure to its timeline detail screen.
6. The detail screen displays the ordered evidence timeline and highlighted failure event, plus the original/minimized schedule data and a route back to the report.

## Visual System

The frontend reproduces the supplied references: matte black background, neon hot pink (`#ff0696` family), thin terminal borders, terminal/pixel-style type, uppercase underscored labels, and restrained glow effects.

The navbar uses the supplied logo asset in place of the mock text. It is fixed, thin, and visually persistent. The landing logo movement uses CSS sticky/scroll behavior and reduced-motion fallback; it must not rely on canvas or a simulated video.

## Error Handling

- Reject invalid/missing Compose uploads with 400 and visible upload feedback.
- Return 404 for unknown runs and show a recoverable “run not found” page.
- Render API/network/SSE errors as execution failures, never as race discoveries.
- Show a no-race-completed screen for deterministic no-failure results.
- Only enable report download when the report endpoint is available.

## Testing and Verification

- API unit tests cover upload validation, run-state transitions, SSE serialization, unknown run handling, report availability, and failure detail responses using an injected fake execution platform.
- Frontend tests cover upload initiation, SSE display/terminal routing, failure selection, report download state, and accessible navigation.
- The existing workspace tests must remain green.
- Build/typecheck both new packages.
- Verify a local browser workflow with the supplied startup-race Compose fixture and a live backend process.

## Explicit MVP Constraints

- Upload supports one Compose YAML file, not a generic archive. Relative build contexts and companion files remain a follow-up because runtime staging is not yet defined.
- The API is local and unauthenticated; do not add accounts, cloud storage, telemetry, or an LLM-driven oracle.
- The timeline and report consume existing deterministic contracts.
