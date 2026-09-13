# DSRD — Distributed Startup Race Debugger

A local startup-race debugger for Docker Compose, local-process, and optional Kubernetes targets. It actively explores startup timing to discover, minimize, and replay hidden readiness failures.

## What it does

```text
 normal application target
      -> perturb startup timing
      -> execute repeatedly
      -> detect a failing schedule
      -> minimize it
      -> save failure.json
      -> replay the same failure
      -> show a timeline
```

DSRD changes startup timing, executes the system repeatedly, detects failures
from runtime evidence, minimizes the triggering schedule, and verifies it by
replaying the saved artifact. It is not a log-only analyzer or static Compose
lint tool.

## How DSRD decides that it found a race

DSRD separates an individual physical run from an experiment result. A run is
`healthy`, a machine-verifiable `workload_failure`, an `execution_error`,
`inconclusive`, or `cancelled`. A race is published only after the experiment
establishes a difference between a healthy baseline and a controlled schedule.

```text
inspect target → prepare/reset outside startup timing → healthy baseline
→ bounded schedule search → matching failure confirmations → minimization
→ independent ordered replay → verified failure artifact
```

By default, the onboarding path requires three healthy baseline runs, three
matching failure confirmations, and three independent replay reproductions.
The failure identity is a structured signature—workload, assertion, failure
category, and stable code when available—not an error-string match. Replay also
requires the saved ordering evidence to occur in the same order.

The oracle accepts evidence such as an unexpected process exit, a failed
declared readiness assertion, a validated application failure event, or an
unexpected terminal-job result. Log lines including `ECONNREFUSED` and
`timeout` provide useful timeline context, but cannot independently declare a
race.

## What DSRD changes, and what it preserves

Schedules contain only explicit start or supported readiness delays. DSRD does
not modify a target repository to manufacture a failure. Compose dependency
conditions (`service_started`, `service_healthy`, and
`service_completed_successfully`) remain in force; a delay changes when an
otherwise eligible action may occur, not the target's declared guarantees.

For each physical Compose attempt, DSRD creates an opaque project identity and
cleans only resources bearing that identity. Image pull/build, target
validation, and reset happen before the measured startup deadline. Local
processes run from command arrays—not shell strings—and their owned process
group is terminated with TERM followed by KILL when required. No broad Docker
cleanup command is used.

## Supported target types

| Target | Input | Readiness/evidence | Notes |
| --- | --- | --- | --- |
| Docker Compose | `compose.yaml`, `compose.yml`, or `docker-compose.*` | Compose lifecycle, health/readiness, terminal workload evidence | Docker and Compose are required. Each run has its own project name. |
| Local process | `manifest.json` | Process, TCP, or HTTP readiness | Commands are explicit arrays; stateful targets need an explicit reset command. |
| Kubernetes | Manifest YAML | Kubernetes adapter evidence | Optional; requires `kubectl` and a disposable cluster. |

Repository onboarding also supports an existing checkout or a pinned Git URL and
ref. A pinned Git source is resolved to a detached revision and recursively
frozen read-only. Inspection is metadata-only: it never runs `npm install`,
package scripts, or arbitrary target commands.

## Outcomes and artifacts

| Outcome | Meaning | Artifact |
| --- | --- | --- |
| `found_failure` | Healthy baseline, repeated matching failure, minimization, and replay all succeeded | Verified v3 artifact when onboarding metadata is available |
| `no_failure` | The declared bounded search completed without a confirmed failure | None |
| `target_unhealthy` | Baseline is already unhealthy | None |
| `needs_configuration` | Required launch, readiness, secret binding, or reset meaning is missing | None |
| `unsupported_target` | No available adapter can execute the target safely | None |
| `execution_error` | Setup, Docker/runtime, timeout, or cleanup error | None |
| `inconclusive` | Evidence conflicts or the execution budget expires | None |
| `cancelled` | The caller stopped the experiment | None |

Legacy v2 artifacts remain readable for compatibility. A verified v3 artifact
adds repository identity, configuration/model/environment digests, required
public bindings, the failure signature, replay ordering constraints, and the
baseline/confirmation/replay counts. Artifacts never contain secret values,
credentials, or raw environment bindings.

## Repository configuration

Portable onboarding uses strict `dsrd.yaml` configuration to select a target,
describe workloads and readiness assertions, declare state reset policy, and
bound the experiment. Unknown fields, invalid dependency references, missing
Compose launch files, unsafe local-process state, and invalid counts/deadlines
are rejected rather than guessed.

```yaml
version: 1
target:
  id: process:api
  adapter: local-process
  root: .
workloads:
  api:
    kind: process
    command: [node, dist/server.js]
    readiness:
      id: api-ready
      type: http
      url: http://127.0.0.1:3000/health
      observer: host
      expectedStatus: 200
state: { policy: fresh-owned }
experiment:
  baselineRuns: 3
  confirmationRuns: 3
  replayRuns: 3
```

See [configuration.md](docs/configuration.md), [outcomes.md](docs/outcomes.md),
and [operations.md](docs/operations.md) for the complete contract and safety
rules.

## Public onboarding commands and API

Inspect without executing a package script, then search either a checkout or a
pinned Git revision. Exactly one of `--checkout` and `--git` is required for a
search; Git acquisition resolves the supplied ref before the detached snapshot
is used.

```bash
race-debugger inspect --checkout ./example --json
race-debugger onboard-search --checkout ./example --json --output failure.json
race-debugger onboard-search --git https://example.invalid/project.git --ref <commit> --json
race-debugger replay failure.json --json
```

`--json` writes exactly one terminal JSON object and no progress output. The
stable discovery exit codes are `0` (`found_failure` or `no_failure`), `2`
(`needs_configuration`), `3` (`unsupported_target`), `4`
(`target_unhealthy`), `5` (`execution_error`), `6` (`inconclusive`), and `130`
(`cancelled`). Malformed direct-search, onboarding, inspection, and replay
inputs return the same JSON `execution_error`/exit-code-5 terminal record.

The HTTP API exposes `POST /api/repositories/inspect`, `POST
/api/repositories/search`, and `POST /api/replay`. Repository search returns
`202` with a run ID and shares the same orchestration service as the CLI. Poll
`GET /api/runs/:runId`, subscribe to `GET /api/runs/:runId/events`, and obtain
a verified artifact at `GET /api/runs/:runId/report`. The event stream closes
after every terminal phase; errors, diagnostics, and JSON responses redact
secret values.

## Why use DSRD

DSRD changes execution timing and relies on deterministic runtime evidence from
the failure oracle. That means it can produce a minimized, replayable
counterexample for a race that a normal startup, static dependency graph, or
log summary can miss. The saved artifact includes the target and schedule, so
replay follows the same platform and oracle path as discovery.

## Requirements

- Node.js 20 or newer
- npm
- Docker Desktop or Docker Engine with Compose v2 for Compose targets
- `kubectl` and a disposable cluster only for Kubernetes targets

## Quick start

```bash
npm install
npm run build
race-debugger search --platform local-process --target fixtures/local-startup-race/manifest.json --delay-options 0,100 --output failure.json
race-debugger replay failure.json
```

Use `compose` with a Compose file, or `local-process` with a local-process
manifest. Kubernetes is optional and requires `kubectl` plus a disposable
cluster.

```bash
race-debugger search --platform kubernetes --target fixtures/kubernetes-startup-race/manifest.yaml --delay-options 0,1500 --output kubernetes-failure.json
race-debugger replay kubernetes-failure.json
```

For the supplied local Kind fixture, create/select the `kind-dsrd-c7` context
before running the Kubernetes command. No cluster is needed for Compose or
local-process workflows.

## Usage

### Interactive mode

Run `race-debugger` with no command from a terminal to open the DSRD dashboard and choose Search, Replay, or Quit.
The guided search uses numbered Docker Compose/local-process choices, validates the selected project directory, and offers a recommended Quick scan that tests one perturbation at a time. Choose Thorough scan only when you intentionally want the larger Cartesian search. Compose projects should contain `compose.yaml`, `compose.yml`, `docker-compose.yaml`, or `docker-compose.yml`; local-process projects should contain `manifest.json`.

### Scriptable mode

```bash
race-debugger search --platform local-process --target fixtures/local-startup-race
race-debugger search --platform compose --target fixtures/startup-race
race-debugger replay failure.json
```

The production CLI routes local-process targets to the local runtime, Compose targets to the Docker Compose runtime, and Kubernetes targets to the optional `kubectl` adapter.

### PowerShell and POSIX replay hints

When an artifact path contains spaces, shell metacharacters, or apostrophes, use the shell-specific replay command printed after a failed search. The CLI prints separately labeled PowerShell and POSIX commands so that copied paths retain their exact value.

## Local Web Interface

Start the API and web app in two terminals:

```powershell
npm run build
npm run dev:api
```

```powershell
npm run dev:web
```

Open `http://127.0.0.1:5173`, scroll to `INITIALIZE_SEQUENCE`, and upload a `.yaml` or `.yml` Docker Compose file. The interface streams real exploration progress, shows the deterministic failure report, exposes its event timeline, and downloads the `FailureArtifact` JSON.

The current upload contract accepts one self-contained Compose file. Compose projects that reference local build contexts, env files, bind-mounted source, or other companion files need archive/project-directory staging before they can run from a browser upload.

## Reproducible validation

Run these checks from the repository root after every runtime or scheduler
change. The test script builds the execution packages first, then runs each
workspace in isolation (nested worktrees and build output are excluded).

```bash
npm install
npm run typecheck
npm test
```

Run the Docker-gated conformance test only when Docker is available:

```bash
DSRD_DOCKER_CONFORMANCE=1 npx vitest run packages/runtime/test/compose.conformance.test.ts
```

### Local-process golden path

The local fixture is deterministic and does not require Docker. First verify
that normal startup is healthy, then run discovery and replay:

```bash
npm run build:execution
node packages/scheduler/dist/cli.js search \
  --platform local-process \
  --target fixtures/local-startup-race/manifest.json \
  --delay-options 0,100 \
  --output failure.json
node packages/scheduler/dist/cli.js replay failure.json
```

Discovery is valid only when the baseline passes, a perturbed schedule produces
machine-verifiable workload evidence, minimization completes, and replay
reproduces the same failure. A generic `timeout` or `ECONNREFUSED` log line is
timeline evidence, not a failure verdict by itself.

### Compose validation

Use a disposable Compose project directory and pass its Compose file explicitly:

```bash
docker info
docker compose -f ./path/to/compose.yml config --quiet
npm run build:execution
node packages/scheduler/dist/cli.js search \
  --platform compose \
  --target ./path/to/compose.yml \
  --delay-options 0,500,1000 \
  --output compose-failure.json
node packages/scheduler/dist/cli.js replay compose-failure.json
```

DSRD performs configuration validation and image pull/build preparation before
the measured startup window. Measured starts use `--no-build` and `--pull never`.
Every attempt uses a unique hashed Compose project name and cleanup is scoped to
that project; do not run broad `docker system prune` commands.

For a manually inspected target, check its declared `depends_on` conditions,
health checks, terminal jobs, build contexts, env files, bind mounts, and
required secrets before starting a search. Setup failures (invalid YAML,
missing images, failed builds, unavailable daemon, port conflicts, or timeouts)
are reported as execution/setup errors and must not be recorded as races.

### Understanding terminal statuses

Physical runs use these statuses:

- `healthy` — readiness and workload evidence completed successfully.
- `workload_failure` — non-zero workload exit, failed readiness, or structured
  application failure evidence.
- `execution_error` — Docker/runtime/observer/cleanup failure.
- `inconclusive` — insufficient or conflicting evidence.
- `cancelled` — explicitly aborted execution.

Only a confirmed workload failure is eligible for a `failure.json` artifact.
Inspect the artifact and timeline before claiming a race:

```bash
node -e 'const a=require("./failure.json"); console.log(JSON.stringify({target:a.target, schedule:a.minimizedSchedule, events:a.events}, null, 2))'
```

Always replay the saved artifact after discovery. If replay does not reproduce
the expected failure and ordering evidence, treat the result as unverified.

### Public projects to try

These repositories are good disposable targets because they are public, have
multiple Compose services, and document their local setup. Clone one into a
temporary directory, inspect its Compose file and required environment values,
then pass the file path to DSRD.

- [Docker Awesome Compose](https://github.com/docker/awesome-compose) — a large
  catalog of small, independent samples. Choose one sample directory and use
  its `compose.yaml`.
- [Docker Todo List App](https://github.com/dockersamples/todo-list-app) — a
  compact application stack with a checked-in `compose.yaml`.
- [Docker Example Voting App](https://github.com/dockersamples/example-voting-app)
  — a multi-service application useful for observing startup ordering.
- [Docker Compose Dev Environment](https://github.com/dockersamples/compose-dev-env)
  — proxy, backend, and database services with a documented
  `docker-compose.yaml`.

Example:

```bash
tmp_dir="$(mktemp -d)"
git clone --depth 1 https://github.com/dockersamples/todo-list-app "$tmp_dir/todo-list-app"
cd "$tmp_dir/todo-list-app"
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml down -v --remove-orphans

# From the DSRD checkout:
node packages/scheduler/dist/cli.js search \
  --platform compose \
  --target "$tmp_dir/todo-list-app/compose.yaml" \
  --delay-options 0,500,1000 \
  --output todo-list-failure.json
node packages/scheduler/dist/cli.js replay todo-list-failure.json
```

Treat third-party repositories as untrusted inputs: do not edit their tracked
files to manufacture a race, do not expose secrets, and remove only the exact
Compose project you started. Some samples require a `.env` file, local build
contexts, host ports, or architecture-specific images; report those as setup
constraints if preflight cannot complete.
