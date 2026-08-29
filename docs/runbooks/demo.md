# Golden Demo Runbook

## Goal
Demonstrate a hidden startup race that appears only under a particular timing and prove the tool can find, minimize, and replay it.

## Pre-Demo Checklist
- Docker running
- no stale fixture containers
- fixture images already built or cached
- CLI installed/built
- known-good normal run tested
- known failing schedule tested
- `failure.json` removed before search

## Demo Flow

### 1. Show the application is normally healthy
Run the fixture normally.

Expected explanation:
"The stack works under normal startup, so this is not a permanently broken application."

### 2. Run the debugger search
```bash
race-debugger search
```

Show schedules being tested, but avoid flooding the terminal.

Example:
```text
[1/..] api=0ms postgres-ready=0ms       PASS
[2/..] api=0ms postgres-ready=500ms     PASS
[3/..] api=0ms postgres-ready=1000ms    PASS
[4/..] api=0ms postgres-ready=1500ms    FAIL
```

### 3. Show timeline
Example:
```text
0ms      postgres container started
20ms     api container started
420ms    api -> postgres connection attempt
421ms    connection refused
1500ms   postgres ready
```

### 4. Show minimization
Explain that the debugger removes/lower perturbations and reruns until it has a smaller reproducer.

### 5. Show artifact
```bash
cat failure.json
```

### 6. Replay
```bash
race-debugger replay failure.json
```

Expected:
```text
Expected failure reproduced.
```

## Judge-Friendly Explanation
"We are not reading logs and asking an LLM what looks wrong. We actively change startup timing, execute the system, use machine-verifiable failure signals, reduce the failing timing, and produce a replayable counterexample."

## Failure Recovery
If live search is slow:
- use a reduced deterministic delay set
- do not change the actual oracle/replay mechanism

If Docker state is dirty:
```bash
docker compose down -v --remove-orphans
```

If live demo fails unexpectedly:
- run replay using the known artifact
- show the saved timeline
- use the backup recording only as final fallback

## Reliability Target
Before judging, run the full golden demo at least five consecutive times on the primary laptop and at least once on another teammate's machine.
