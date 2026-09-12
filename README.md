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
