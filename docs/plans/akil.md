# Schedule Exploration Component Plan

Any contributor may work on this component. It covers generating startup
schedules, running experiments through the Docker controller, finding failures,
minimizing the failing schedule, and producing replayable output.

## Main Goal

Build the part of the system that answers:

> Which startup timing causes this stack to fail?

## Responsibilities

1. Define the schedule format.
2. Generate candidate startup schedules.
3. Run schedules through the Docker Compose controller.
4. Receive `RunResult` data from the observability layer.
5. Detect the first failing schedule.
6. Minimize the failing schedule.
7. Save the result as `failure.json`.
8. Support replay using the saved schedule.

## Tech Stack

- Node.js
- TypeScript
- Commander.js or Yargs
- JSON for schedule and result files
- Zod for schema validation

## CLI Commands Owned

```bash
race-debugger search
race-debugger replay failure.json
```

## Input Contract

```ts
type Schedule = {
  id: string;
  services: {
    [serviceName: string]: {
      startDelayMs?: number;
      readinessDelayMs?: number;
    };
  };
};
```

## Output Contract

```ts
type SearchResult = {
  status: "found_failure" | "no_failure";
  testedSchedules: number;
  failingSchedule?: Schedule;
  minimizedSchedule?: Schedule;
  failureReason?: string;
  events?: TimelineEvent[];
};
```

## MVP Algorithm

Start simple with a grid search.

Example delay values:

```ts
const delayOptionsMs = [0, 500, 1000, 1500, 2000, 3000];
```

Try schedules such as:

```json
{
  "id": "schedule-001",
  "services": {
    "postgres": {
      "readinessDelayMs": 1800
    },
    "api": {
      "startDelayMs": 0
    },
    "worker": {
      "startDelayMs": 300
    }
  }
}
```

## Minimization Strategy

For the MVP, minimization does not need to be mathematically perfect.

Use this approach:

1. Start from a failing schedule.
2. Remove one delay at a time.
3. Re-run the schedule.
4. If it still fails, keep the simpler schedule.
5. If it passes, restore that delay.
6. Try lowering delay values step by step.

Example final explanation:

```txt
The API fails when PostgreSQL readiness is delayed by at least 1800ms while the API starts immediately.
```

## Day 1 Tasks

- Set up TypeScript CLI skeleton.
- Define `Schedule`, `RunResult`, and `TimelineEvent` types.
- Generate schedule combinations.
- Print generated schedules without running Docker yet.

## Day 2 Tasks

- Call runtime's `runSchedule(schedule)` function.
- Stop after first failing schedule.
- Save failing schedule to JSON.
- Implement basic minimization.
- Add replay command.

## Day 3 Tasks

- Polish CLI output.
- Add clear failure summary.
- Export `failure.json` and `timeline.json`.
- Test complete demo flow multiple times.

## Done Criteria

This component is done when this works:

```bash
race-debugger search
```

Output:

```txt
Failure found after 7 schedules.
Minimal cause: API starts before PostgreSQL is ready.
Replay: race-debugger replay failure.json
```
