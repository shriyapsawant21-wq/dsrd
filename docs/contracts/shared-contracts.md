# Shared Contracts

These interfaces are the boundary between the three workstreams. Implement them once in `packages/contracts/src/index.ts` and import them everywhere.

```ts
export type ServiceSchedule = {
  startDelayMs?: number;
  readinessDelayMs?: number;
};

export type Schedule = {
  id: string;
  services: Record<string, ServiceSchedule>;
};

export type TimelineEvent = {
  timeMs: number;
  service: string;
  event: string;
  detail?: string;
};

export type RunResult = {
  scheduleId: string;
  status: "pass" | "fail";
  events: TimelineEvent[];
  logs: string[];
  failureReason?: string;
};

export type FailureArtifact = {
  version: 1;
  createdAt: string;
  originalSchedule: Schedule;
  minimizedSchedule: Schedule;
  expectedFailureReason?: string;
  events: TimelineEvent[];
};
```

## Runtime Boundary

Riya exposes:

```ts
export interface RuntimeController {
  runSchedule(schedule: Schedule): Promise<RunResult>;
  stopStack(): Promise<void>;
  resetStack(): Promise<void>;
  replaySchedule(schedule: Schedule): Promise<RunResult>;
}
```

`RunResult.status` must come from the proof/oracle behavior agreed with Shriya, not from Akil's search engine.

## Oracle Boundary

Shriya owns the logic that converts observed state into pass/fail evidence.

Conceptually:

```ts
export interface FailureOracle {
  evaluate(input: ObservationSnapshot): Promise<RunResult>;
}
```

The exact `ObservationSnapshot` shape can be internal to runtime/observer integration during MVP, but `RunResult` is public and fixed.

## Search Boundary

Akil consumes only:

```ts
(schedule: Schedule) => Promise<RunResult>
```

The search engine should be testable with a fake runner and should not depend directly on Docker.

## Contract Change Rule
Any change to these public shapes requires:
1. updating this file
2. updating `packages/contracts`
3. checking all three workstreams
4. merging the contract change before dependent feature changes
