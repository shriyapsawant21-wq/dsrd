# Reliable Compose Race Detection Design

## Purpose

DSRD must prove startup/readiness races by executing a prepared target under
controlled schedules, applying a deterministic proof oracle, minimizing a
confirmed failure, and replaying the same failure. Docker/setup failures,
timeouts, unhealthy baselines, and unstable outcomes must remain visible as
separate outcomes and must never create a race artifact.

## Scope and constraints

- Keep `packages/contracts` as the single source of public types.
- Scheduler owns exploration, confidence checks, minimization, artifacts, CLI,
  and replay reporting.
- Runtime owns Compose preflight, lifecycle, controlled startup, collection,
  timeout handling, and cleanup.
- Proof owns readiness/terminal-job observation, timeline normalization, and
  deterministic classification.
- Discovery and replay must call the same platform/runtime/proof path.
- Keep the current local-process fixture as a fast test path.
- Preserve existing Kubernetes CLI work; it is not part of this Compose repair.

## Contract model

`RunResult.status` becomes a classified terminal outcome:

```ts
type RunStatus =
  | "pass"
  | "race_failure"
  | "execution_error"
  | "target_unhealthy"
  | "inconclusive";
```

`RunResult` retains timeline and logs, and gains structured diagnostics as
needed to describe execution/setup errors without treating them as proof. A
failure artifact records `expectedStatus: "race_failure"` and its expected
reason/evidence. Existing v2 schedule shape remains unchanged:

```ts
{ id: string; perturbations: Array<{ workloadId; phase; delayMs }> }
```

All scheduler, runtime, proof, API, web, fixture, and test consumers migrate in
the same change. No local replacement types are introduced.

## Execution model

### Preflight

Compose platforms expose an explicit prepare/preflight operation used once
before baseline timing begins. It resolves the Compose file, runs Compose config
validation, and acquires/builds target images. Config/build/pull/port failures
return `execution_error` diagnostics. The preflight timeout is configurable and
does not consume the experiment run timeout.

### Baseline and perturbation runs

Baseline schedules preserve Compose dependency handling. Perturbed schedules
use controlled `--no-deps` starts only when a nonzero start perturbation is
present; the controller starts all workloads according to the schedule and
records scheduling events. A readiness perturbation uses the runtime adapter
where supported. Runtime collects Compose state, Docker health, logs, and
terminal-job status until the proof layer declares a terminal outcome or the
configured run/readiness timeout expires.

Timeouts, Docker command failures, and cleanup failures map to
`execution_error`; none map to `pass` or `race_failure`. Every run attempts to
clear delay injection and down only the selected Compose project, including
preflight, reset, start, observation, timeout, and replay error paths.

## Proof model

The proof layer classifies `race_failure` only from machine-verifiable evidence:

- an explicit structured application failure event;
- a nonzero terminal service/job exit;
- a failed Docker health check;
- a configured HTTP/TCP readiness failure; or
- an expected terminal job outcome.

Generic logs, including `ECONNREFUSED` and `timeout`, generate diagnostic
timeline events only. They cannot independently produce `race_failure`.
Running containers are not sufficient success evidence. The observer waits for
configured readiness and terminal jobs, returning `target_unhealthy` for a
healthy baseline that cannot be established and `inconclusive` for unsupported
or incomplete evidence rather than guessing.

## Confidence, minimization, and replay

Search prepares the target, then requires configurable repeated baseline passes
(default 3) before exploration. Any baseline error/unhealthy result stops
search with that category; pass/fail alternation that cannot meet the threshold
is `inconclusive`.

Candidate schedules require the same configurable count of `race_failure`
results before acceptance. The confirmation loop rejects mixed outcomes as
inconclusive and does not serialize an artifact. Minimization reruns retained
candidates with the same confirmation policy, explicitly attempting removal and
lower delay values. The final minimized schedule must reproduce the same
`race_failure` category and meaningful ordering evidence. Artifact replay calls
the platform replay method and succeeds only when category, reason (when
present), and required timeline ordering match.

## UI, API, CLI, artifacts, and docs

CLI search accepts run, readiness, preflight, baseline-confirmation, and
candidate-confirmation controls. It prints and exits distinctly for race found,
target setup failure, target unhealthy, and inconclusive results. API progress
and terminal states preserve those categories; UI renders a non-race terminal
state instead of a failure report. Only a confirmed race writes `failure.json`.

The Compose fixture uses the v2 `perturbations` schedule. Its documented CLI
path performs preflight, three healthy baselines, exploration, minimization,
artifact serialization, and replay through the production platform. README and
demo documentation explain timeout controls, confidence settings, preflight,
and third-party target limitations.

## Testing and verification

Focused tests cover preflight failure, timeout classification, log-only
diagnostics, baseline instability, failure confirmation, flaky/inconclusive
outcomes, replay mismatch, readiness/terminal-job observation, and cleanup on
every error path. Vitest explicitly excludes `.worktrees`, nested repositories,
dependencies, and build output. A Docker Compose integration test runs when
Docker is available and otherwise explicitly skips with its reason.

Completion verification requires fresh `npm run typecheck`, `npm test`, the
local-process discover/minimize/replay command, and repeated Compose fixture
discover/minimize/replay commands. Any failure is reported as a limitation
rather than claimed successful.
