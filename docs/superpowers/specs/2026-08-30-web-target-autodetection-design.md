# Web Target Auto-Detection Design

## Goal

Allow the web dashboard to accept either an existing Compose project folder or
an existing local-process project folder, detecting the project type from its
materialized conventional target file. The web path must use the same existing
platform adapters and scheduler pipeline as the CLI.

## Detection

After upload materialization, the API inspects the project folder for exactly
one supported target:

- Compose: one of `compose.yaml`, `compose.yml`, `docker-compose.yaml`, or
  `docker-compose.yml`.
- Local process: `manifest.json`.

If no target is found, the API returns an actionable 400 response. If both a
Compose target and `manifest.json` are present, it returns a 400 ambiguity
response rather than guessing. The UI retains generic “project folder” copy.

## Execution Path

The materializer returns the shared `TargetConfig` in addition to the temporary
project directory. `RunService` receives that target and passes it to the
production runner. The production runner obtains the existing
`createDefaultPlatform()` router and invokes its current `discover` and `run`
methods through the existing `generateCandidates` and `discoverFailure` flow.

```text
folder -> materializer -> TargetConfig -> default platform router
       -> existing discovery/search/minimization/proof -> RunStore/SSE/UI
```

This does not modify candidate generation, caps, delays, minimization, replay,
runtime timeouts, Docker policy, local-process policy, proof observers, or the
shared contract definitions.

## Errors and Verification

Tests cover detection of Compose and local-process folders, missing/ambiguous
targets, API invocation with a local-process target, and both existing project
types through the production runner's adapter boundary. Existing API/web tests,
typechecks, and the full project suite remain required.

## Files Expected to Change

- `packages/api/src/project-upload.ts` and tests: target detection.
- `packages/api/src/run-service.ts`, `app.ts`, and tests: pass `TargetConfig`
  instead of a Compose-file string.
- `packages/api/src/production.ts` and tests: route through the existing
  scheduler default platform.

No files in `packages/contracts`, `packages/scheduler`, `packages/runtime`, or
`packages/proof` are changed.
