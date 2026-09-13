# DSRD — Distributed Startup Race Debugger

DSRD finds startup-order and readiness races in applications that normally
appear to start correctly. It deliberately perturbs permitted startup timing,
runs the target under those schedules, uses a machine-verifiable failure oracle
to identify a real failure, minimizes the schedule, and independently replays
the result before publishing an artifact.

It is a dynamic debugger—not a static Compose linter, log summarizer, or an
LLM that guesses whether a failure occurred.

## What DSRD does

```text
inspect a repository or target
  → validate its launch/readiness/reset contract
  → establish a healthy baseline
  → explore bounded timing schedules
  → confirm one structured failure signature
  → minimize the failing schedule
  → independently replay it in order
  → save a verified, redacted v3 failure artifact
```

The oracle, rather than a log-text heuristic, decides whether an individual
run is healthy or failed. A failure can be an unexpected workload exit, failed
declared HTTP/TCP/process readiness assertion, structured application event, or
unexpected terminal-job result. Log messages such as `ECONNREFUSED` and
`timeout` are useful timeline evidence, but never prove a race by themselves.

## When DSRD publishes a race

DSRD distinguishes a physical run from a verified discovery result. A v3
artifact is published only when all of these gates hold:

1. The required healthy baseline runs pass.
2. An explored schedule produces a machine-verifiable workload failure.
3. Required confirmations have the same structured failure signature.
4. Minimization preserves that signature and its required repetition count.
5. Independent replay reproduces both the failure and its required event order.
6. Repository provenance and required v3 metadata are complete.

The default onboarding policy requires three healthy baselines, three matching
failure confirmations, and three independent replay reproductions. Setup
errors, unsupported or under-configured targets, budget exhaustion,
inconsistent evidence, invalid provenance, or an unsuccessful replay never
produce a failure artifact.

## Supported targets

| Target | Input | What DSRD controls | Requirements |
| --- | --- | --- | --- |
| Docker Compose | `compose.yaml`, `compose.yml`, or `docker-compose.*` | Supported startup/readiness timing while preserving `depends_on` conditions | Docker Engine/Desktop and Compose v2 |
| Local process | Explicit `manifest.json` or `dsrd.yaml` workload commands | Explicit command-array processes and readiness checks | Node.js; explicit reset for stateful targets |
| Kubernetes | Manifest YAML | Namespace-scoped workload creation and observation | `kubectl` and a disposable cluster; opt-in conformance uses Kind |

Repository onboarding accepts either an existing checkout or a Git URL with a
ref. Git input is resolved to a detached revision, recursively frozen
read-only, and recorded as immutable provenance. Inspection is metadata-only:
it never runs package scripts, `npm install`, or arbitrary application code.

## Requirements

- Node.js 20 or newer
- npm
- Docker Engine/Desktop and Compose v2 for Compose targets
- `kubectl` and a disposable cluster only for Kubernetes targets

Install and build:

```bash
npm install
npm run build
```

The development CLI is available after `npm run build:execution` as
`node packages/scheduler/dist/cli.js`. Published installations expose the
same command as `race-debugger`.

## Fastest safe path: inspect, search, replay

Start with inspection. It discovers candidate targets without executing the
repository:

```bash
race-debugger inspect --checkout ./my-project --json
```

When inspection identifies a target and its configuration is complete, search
the checkout and save a result if DSRD verifies a race:

```bash
race-debugger onboard-search \
  --checkout ./my-project \
  --target-id compose:compose.yaml \
  --config dsrd.yaml \
  --output failure.json
```

Use a pinned Git source when the target must be acquired reproducibly:

```bash
race-debugger onboard-search \
  --git https://example.com/organization/project.git \
  --ref <commit-or-tag> \
  --target-id compose:compose.yaml \
  --config dsrd.yaml \
  --output failure.json
```

Exactly one of `--checkout` and `--git` is required. `--ref` defaults to
`HEAD`, but a commit hash is the most reproducible choice. Do not place
credentials in a Git URL, command line, configuration, or artifact.

Replay always uses the same shared platform/oracle boundary as discovery:

```bash
race-debugger replay failure.json
```

If replay does not reproduce the saved failure signature and ordered evidence,
treat the original result as unverified.

## Direct target search

Use `search` when you already have an explicit target rather than a repository
onboarding configuration. The local fixture is the quickest Docker-free
example:

```bash
npm run build:execution
node packages/scheduler/dist/cli.js search \
  --platform local-process \
  --target fixtures/local-startup-race/manifest.json \
  --delay-options 0,100 \
  --output failure.json
node packages/scheduler/dist/cli.js replay failure.json
```

For a Compose file, validate it first and provide explicit delay choices:

```bash
docker info
docker compose -f ./path/to/compose.yml config --quiet
node packages/scheduler/dist/cli.js search \
  --platform compose \
  --target ./path/to/compose.yml \
  --delay-options 0,500,1000 \
  --output compose-failure.json
```

Useful search controls are `--quick`, `--max-runs`, `--baseline-runs`, and
`--confirmation-runs`. Prefer defaults for verified onboarding; reduce counts
only when intentionally doing an exploratory, non-production investigation.

Running `race-debugger` with no subcommand starts an interactive terminal flow
for local-process and Compose searches. Use scriptable commands in CI or other
automation.

## Repository configuration

`dsrd.yaml` is strict and versioned. It selects a target, declares workloads
and readiness assertions, defines state isolation/reset behavior, records
required bindings without their values, and sets experiment limits.

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

Unknown fields, unsafe local-process state, missing launch commands, malformed
readiness targets, missing required bindings, invalid dependency references,
and invalid experiment limits are rejected rather than guessed. A stateful
local target must declare an explicit reset command/policy; DSRD will not infer
how to reset application data.

See [configuration.md](docs/configuration.md) for the full schema and
[operations.md](docs/operations.md) for operational safety requirements.

## JSON output and stable exit codes

Add `--json` for automation:

```bash
race-debugger inspect --checkout ./my-project --json
race-debugger onboard-search --checkout ./my-project --json --output failure.json
race-debugger replay failure.json --json
```

JSON mode emits exactly one terminal JSON record and no progress noise. Search
records include `status`, `exitCode`, and `testedSchedules`; a verified failure
also includes `artifactPath`. Replay records include the replay status and
physical `RunResult`. Setup and input errors emit a JSON
`execution_error` record rather than being reported as `no_failure`.

| Search status | Exit code | Meaning |
| --- | ---: | --- |
| `found_failure` | 0 | A verified artifact was produced. |
| `no_failure` | 0 | The bounded search completed without a confirmed failure. |
| `needs_configuration` | 2 | Required safe execution details are missing. |
| `unsupported_target` | 3 | No available adapter can execute the target safely. |
| `target_unhealthy` | 4 | The baseline is already unhealthy. |
| `execution_error` | 5 | Setup, runtime, timeout, or cleanup failed. |
| `inconclusive` | 6 | Evidence conflicted or the execution budget expired. |
| `cancelled` | 130 | The caller cancelled the operation. |

`replay --json` returns exit code 0 for `reproduced`, 4 for
`not_reproduced`, and 5 for invalid artifact/setup errors.

## Artifacts and evidence

Verified onboarding results are v3 artifacts. They include:

- repository snapshot/provenance, Git origin and resolved revision where used,
  and a content digest;
- selected target, configuration digest, declared capability/model/environment
  data, and required bindings without secret values;
- experiment policy plus baseline, confirmation, and replay counts;
- the original and minimized schedules, structured failure signature, expected
  failure reason, and ordered replay constraints; and
- timeline events and runtime evidence needed to explain and replay the race.

Legacy v2 artifacts remain readable for compatibility. Secret values are
redacted from artifacts, logs, diagnostics, CLI JSON, API JSON, and errors.

## HTTP API and web interface

Start the API and web application in separate terminals:

```bash
npm run build
npm run dev:api
```

```bash
npm run dev:web
```

Open `http://127.0.0.1:5173`. The current web upload flow accepts one
self-contained Compose file, streams exploration progress, renders the
deterministic report/timeline, and downloads a `FailureArtifact`. Projects
with local build contexts, env files, bind mounts, or companion files require
project-directory/archive staging rather than a single-file upload.

The API listens on `127.0.0.1:4317` by default; set `DSRD_API_PORT` to change
it. Public repository endpoints use the same onboarding and replay services as
the CLI:

| Endpoint | Use |
| --- | --- |
| `POST /api/repositories/inspect` | Read-only repository inspection. |
| `POST /api/repositories/search` | Creates an asynchronous run and returns `202` with `runId`. |
| `POST /api/replay` | Replays a supplied artifact through the shared service. |
| `GET /api/runs/:runId` | Returns current or terminal run details. |
| `GET /api/runs/:runId/events` | Server-sent progress/terminal events; closes for every terminal outcome. |
| `GET /api/runs/:runId/report` | Returns the persisted verified artifact, or `409` until ready. |

For example, submit an asynchronous checkout search:

```bash
curl -sS -X POST http://127.0.0.1:4317/api/repositories/search \
  -H 'content-type: application/json' \
  -d '{"repository":{"kind":"checkout","path":"./my-project"}}'
```

Use the returned run ID to poll `GET /api/runs/:runId`, stream events, then
retrieve `/api/runs/:runId/report` only after a successful result. API errors,
diagnostics, and SSE payloads redact configured secret values.

## Isolation and cleanup guarantees

DSRD is deliberately conservative with user resources:

- Compose uses a fresh opaque project/attempt identity for every run and replay.
  It removes only containers, networks, and volumes it owns; it preserves
  dependency conditions and rejects unsafe external mutable volumes.
- Pull/build/preparation and explicit reset happen outside measured startup
  timing. Host-port conflicts have explicit diagnostics.
- Local processes are launched as explicit argument arrays, never shell
  strings. DSRD tracks only processes it owns and cleans their process tree
  with TERM followed by KILL if necessary.
- Kubernetes conformance creates/removes only the fixture namespace; it never
  deletes the selected cluster or an arbitrary shared namespace.

Never run broad cleanup commands such as `docker system prune` to recover from
a test. A cleanup failure is an `execution_error` and prevents artifact
publication.

## Verification and conformance

Run the primary suite from the repository root:

```bash
npm run typecheck
npm test
```

Run Docker conformance when Docker and Compose are available:

```bash
DSRD_DOCKER_CONFORMANCE=1 npx vitest run packages/runtime/test/compose.conformance.test.ts
```

Run Kind conformance when `kubectl`, `kind`, and a disposable selected cluster
are available:

```bash
KUBECONFIG=/path/to/kubeconfig KUBERNETES_C7_INTEGRATION=1 \
  npx vitest run packages/scheduler/src/kubernetes-kind.integration.test.ts
```

The Kind fixture uses only the `dsrd-kubernetes-race` namespace and removes it
after every test; it does not create or delete the selected Kind cluster.

## Further reading

- [Architecture](architecture.md)
- [Configuration reference](docs/configuration.md)
- [Outcome definitions](docs/outcomes.md)
- [Operational safety](docs/operations.md)
- [Testing and conformance](docs/testing.md)
- [Demo runbook](docs/runbooks/demo.md)
- [Integration contracts](docs/integration.md)
