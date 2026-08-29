# Distributed Startup Race Debugger — Overall Plan

## Objective
Build a local Docker Compose debugger that actively explores startup timing, discovers hidden race conditions, minimizes the timing needed to reproduce them, and emits a deterministic replay artifact plus timeline.

## Problem
A container being started does not mean the process inside it is ready. Services often encode hidden timing assumptions: an API assumes Postgres is listening, a worker assumes the API is healthy, or migrations assume another dependency has completed. These failures are intermittent because startup timing changes across runs.

Existing health checks and `depends_on` improve orchestration but do not actively search for hidden timing assumptions.

## MVP
The three-day MVP must:
1. run a Compose application repeatedly
2. inject controlled startup/readiness delays
3. observe lifecycle/readiness/failure events
4. automatically find a failing schedule
5. minimize the failing schedule
6. save a replayable artifact
7. replay the same failure
8. produce a timeline for judges

## Architecture

```text
Compose file
   |
   v
Service Model
   |
   v
Schedule Generator  <---------------------------+
   |                                             |
   v                                             |
Runtime Controller -> Event Collector -> Oracle |
   |                                  |          |
   +------------ RunResult -----------+          |
                    |                            |
             failure found?                      |
                    | yes                        |
                    v                            |
                Minimizer -----------------------+
                    |
                    v
              failure.json
                    |
                    v
                  Replay
                    |
                    v
              Timeline / UI
```

## Team Division

| Owner | Area | Main output |
|---|---|---|
| Akil | Schedule exploration | candidate schedules, minimization, failure artifact, CLI |
| Riya | Docker runtime | `runSchedule(schedule)` and replay execution |
| Shriya | Proof layer | demo fixture, oracle, `TimelineEvent[]`, reliable `RunResult` |

## Technology
- Node.js + TypeScript
- Docker + Docker Compose
- `child_process` for Docker CLI in MVP
- `yaml` for Compose parsing
- `zod` for runtime schemas
- `fetch` for HTTP probes
- Node `net` for TCP probes
- Commander.js or Yargs for CLI

## Golden Demo Fixture
Minimum useful fixture:

```text
postgres -> api -> worker
```

The API makes one startup-time Postgres connection without robust retry logic.

Normal case:
```text
postgres ready -> api starts -> db connect succeeds -> worker succeeds
```

Failing case:
```text
postgres container starts
api starts immediately
api tries DB before readiness
ECONNREFUSED / startup exit
postgres becomes ready later
```

The debugger must discover the problematic timing instead of being explicitly given the threshold.

## Search Strategy
MVP uses deterministic bounded exploration.

Example delay set:
```ts
[0, 500, 1000, 1500, 2000, 3000]
```

Start with a narrow search over one or two perturbable services. Avoid a full combinatorial search across every service for the hackathon MVP.

Stop after the first deterministic failure, then minimize.

## Minimization
Use simple greedy/delta-style reduction:
1. begin with a failing schedule
2. remove one perturbation
3. rerun
4. keep removal if failure remains
5. otherwise restore
6. lower remaining delay values stepwise

A mathematically minimal schedule is not required. A small stable reproducer is.

## Failure Oracle
Machine-verifiable signals first:
- container non-zero exit
- health check timeout
- HTTP readiness timeout
- TCP readiness failure
- deterministic fixture failure marker
- expected service unavailable

Log strings may support diagnosis but should not be the only proof when a stronger signal exists.

## Replay
`failure.json` contains the minimized schedule and expected evidence. Replay re-executes exactly that schedule and asks the same oracle whether the expected failure reproduced.

```bash
race-debugger replay failure.json
```

## Day 1
Shared:
- commit contracts and interfaces first

Akil:
- schedule schemas
- candidate generation
- search loop against mock runtime

Riya:
- Docker runner
- stop/reset
- service startup delays

Shriya:
- demo Compose stack
- intentional race
- basic readiness probes

## Day 2
Akil:
- connect search to real `runSchedule`
- first failing candidate
- minimization

Riya:
- reliable reset between runs
- logs/metadata
- execution from provided schedule

Shriya:
- deterministic oracle
- timeline events
- tune fixture reliability

End-of-day integration gate:
```text
search -> execute -> observe -> fail -> save -> replay -> same fail
```

## Day 3
- repeated demo reliability testing
- minimization clarity
- timeline visualization
- CLI polish
- test on another teammate machine
- backup demo recording

## Success Criteria
The core submission is successful only if the team can demonstrate:
1. normal run passes
2. search explores schedules
3. a failing timing is found automatically
4. timeline shows why it failed
5. schedule is minimized
6. replay reproduces it

## Stretch Goals
Only after the above works:
- randomized exploration
- binary search threshold minimization
- additional readiness probe types
- first cross-service request extraction
- HTML report
- multiple race fixture patterns
