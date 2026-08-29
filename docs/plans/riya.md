# Riya Plan - Docker Compose Control and Delay Injection

## Ownership

Riya owns the Docker execution layer: starting, stopping, resetting, delaying, and replaying Docker Compose services in a repeatable way.

## Main Goal

Build the part of the system that answers:

> Can we reliably run this Compose stack under a specific startup schedule?

## Responsibilities

1. Load or receive the target Docker Compose project.
2. Start and stop the stack safely.
3. Reset containers, networks, and volumes when needed.
4. Start services with controlled delays.
5. Inject readiness delays for selected services.
6. Provide a `runSchedule(schedule)` function for Akil.
7. Provide logs and Docker metadata to Shriya's observability layer.
8. Implement replay execution from `failure.json`.

## Tech Stack

- Docker
- Docker Compose
- Node.js
- TypeScript
- Node `child_process`
- YAML parsing with `yaml`

## Core Functions

```ts
async function runSchedule(schedule: Schedule): Promise<RunResult>;
async function stopStack(): Promise<void>;
async function resetStack(): Promise<void>;
async function replaySchedule(path: string): Promise<RunResult>;
```

## Docker Commands

Useful commands:

```bash
docker compose up -d
docker compose down
docker compose down -v
docker compose logs
docker compose ps
docker inspect
```

## Delay Injection Options

### MVP Option 1: Controlled Service Start

Start dependencies manually with delays:

```bash
docker compose up -d postgres
sleep 1.8
docker compose up -d api
sleep 0.3
docker compose up -d worker
```

This is the simplest and should be the first implementation.

### MVP Option 2: Wrapper Command

Override service commands with a delay wrapper:

```bash
sh -c "sleep 1.8 && original-command"
```

This is useful if the container must exist before the app process starts.

### MVP Option 3: Readiness Proxy

For stretch work, insert a small TCP proxy that delays readiness. This is powerful but not required for the three-day MVP.

## Run Flow

For every schedule:

1. Reset stack.
2. Record run start time.
3. Start services according to schedule.
4. Wait for Shriya's pass/fail signal.
5. Collect logs.
6. Stop stack.
7. Return result.

## Day 1 Tasks

- Create Docker Compose control module.
- Implement `stopStack()`.
- Implement `resetStack()`.
- Implement service start order and `startDelayMs`.
- Verify the demo stack can be started and stopped repeatedly.

## Day 2 Tasks

- Add schedule-based execution.
- Add `readinessDelayMs` support where possible.
- Capture logs per service.
- Make reset reliable between experiments.
- Implement replay from saved schedule.

## Day 3 Tasks

- Handle failures cleanly.
- Add timeouts so runs do not hang.
- Make terminal output readable.
- Test replay reliability at least 5 times.

## Done Criteria

Riya's part is done when this works:

```bash
race-debugger replay failure.json
```

And it:

1. Cleans the old stack.
2. Starts services with the saved delays.
3. Reproduces the same failure.
4. Cleans up after the run.

