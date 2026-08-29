# Service-Agnostic Startup Race Debugger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make discovery, minimization, artifacts, and replay operate on generic workloads across Compose and local-process targets.

**Architecture:** Platform adapters discover and run generic workload perturbations. The scheduler receives only injected adapter execution functions and oracle-produced RunResults. Kubernetes is a future adapter after the Compose and local-process paths are stable.

**Tech Stack:** Node.js, TypeScript, Vitest, Zod, Commander, Docker Compose, child_process.

**Spec:** docs/superpowers/specs/2026-08-29-service-agnostic-debugger-design.md

## Global Constraints

- Do not implement database- or framework-specific adapters.
- Compose and local-process are MVP adapters; Kubernetes is planned only after C4 and C5.
- The oracle alone sets RunResult.status; adapter errors are execution errors, never discovered races.
- Artifact files cannot contain credentials, tokens, kubeconfig contents, or secret environment values.
- Public contract changes require Akil, Riya, and Shriya review before consumer migration.
- Update docs/checkpoints.md immediately after every checkpoint.

---

## File Structure

- docs/checkpoints.md — current owner, status, evidence, remaining work, dependencies, and blockers.
- docs/prompts/checkpoints/C0.md through C7.md — agent-ready checkpoint prompts.
- docs/contracts/shared-contracts.md and packages/contracts/src/index.ts — generic v2 public contract.
- packages/scheduler/src — generic engine owned by Akil.
- packages/runtime/src/execution-platform.ts — generic adapter interface owned by Riya.
- packages/runtime/src/compose-platform.ts and local-process-platform.ts — adapter implementations owned by Riya.
- packages/proof/src — normalized workload evidence and oracle-owned classification.

### Task 1: Add checkpoint tracking and checkpoint prompts

**Files:**
- Create: docs/checkpoints.md
- Create: docs/prompts/checkpoints/C0.md through docs/prompts/checkpoints/C7.md

**Interfaces:**
- Produces: one status record and one executable owner prompt per checkpoint.

- [ ] **Step 1: Create the checkpoint status document**

Use a section per C0-C7 with this exact data shape:

~~~
## C0 — Generic contract v2
Status: in progress
Owner: Akil, Riya, Shriya
Evidence: pending npm run typecheck
Commit/PR: none
Remaining work: approve and merge contract migration
Dependencies: three-owner review required
Blockers: none
Next checkpoint: C1
~~~

Set C1-C3 to blocked on C0, C4 to blocked on C1-C3, C5 to blocked on C4, C6 to planned after stable C4/C5, and C7 to planned after stable C4/C5.

- [ ] **Step 2: Create agent prompts C0-C7**

Every prompt has the headings Goal, Non-goals, Owner, Inputs, Requested work, Acceptance criteria, Verification, and Checkpoint update. C0 explicitly requests contract review; C1 owns generic scheduler; C2 Compose adapter; C3 proof normalization; C4/C5 team integration; C6 local-process adapter; C7 future Kubernetes admission.

- [ ] **Step 3: Validate the documentation**

Run: rg -n "C[0-7]|Checkpoint update|Verification" docs/checkpoints.md docs/prompts/checkpoints

Expected: each checkpoint and every required heading appears.

- [ ] **Step 4: Commit**

~~~
git add docs/checkpoints.md docs/prompts/checkpoints
git commit -m "docs: add integration checkpoint tracking"
~~~

### Task 2: Migrate shared contracts to generic workloads (C0)

**Files:**
- Modify: docs/contracts/shared-contracts.md
- Modify: packages/contracts/src/index.ts
- Modify: packages/contracts/test/contracts.test.ts

**Interfaces:**
- Produces: Workload, Perturbation, TargetConfig, generic Schedule, ExecutionPlatform, and FailureArtifact version 2.
- Consumes: existing TimelineEvent and RunResult semantics.

- [ ] **Step 1: Write the failing contract test**

~~~
const schedule: Schedule = {
  id: "schedule-001",
  perturbations: [
    { workloadId: "sqlite-migrate", phase: "ready", delayMs: 500 }
  ]
};
const artifact: FailureArtifact = {
  version: 2,
  createdAt: "2026-08-29T00:00:00.000Z",
  target: { platform: "local-process", manifestPath: "app.race.json" },
  originalSchedule: schedule,
  minimizedSchedule: schedule,
  events: []
};
expect(artifact.target.platform).toBe("local-process");
~~~

- [ ] **Step 2: Verify the test fails against v1**

Run: npm test -- packages/contracts/test/contracts.test.ts

Expected: failure because v1 has services, lacks target, and only permits version 1.

- [ ] **Step 3: Add the shared v2 types**

~~~
export type Workload = {
  id: string;
  kind: "service" | "process" | "job" | "initializer";
  dependsOn?: string[];
  perturbablePhases: Array<"start" | "ready">;
};
export type Perturbation = {
  workloadId: string;
  phase: "start" | "ready";
  delayMs: number;
};
export type Schedule = {
  id: string;
  perturbations: Perturbation[];
};
~~~

Add TargetConfig for compose, local-process, and kubernetes identifiers; add ExecutionPlatform with discover/reset/run/replay; change FailureArtifact to version 2 and add target. Mirror these exact types in the shared-contracts document.

- [ ] **Step 4: Verify contract migration**

Run: npm test -- packages/contracts/test/contracts.test.ts && npm run typecheck

Expected: pass only after all three owners have migrated compile-time consumers.

- [ ] **Step 5: Obtain all owner approvals and commit**

~~~
git add docs/contracts/shared-contracts.md packages/contracts
git commit -m "feat: define generic workload contracts"
~~~

### Task 3: Migrate Akil scheduler to workload perturbations (C1)

**Files:**
- Modify: packages/scheduler/src/candidates.ts, minimize.ts, artifact.ts, orchestrator.ts, cli.ts
- Create: packages/scheduler/src/fake-platform.ts
- Modify: packages/scheduler/src/candidates.test.ts, minimize.test.ts, artifact.test.ts, orchestrator.test.ts, cli.test.ts

**Interfaces:**
- Consumes: Workload, TargetConfig, Schedule, FailureArtifact, and injected ExecutionPlatform functions.
- Produces: generic candidate generation, minimization, artifact creation, and replay orchestration.

- [ ] **Step 1: Write a failing workload candidate test**

~~~
const workloads: Workload[] = [{
  id: "sqlite-migrate",
  kind: "initializer",
  perturbablePhases: ["ready"]
}];
expect(generateCandidates(workloads, [0, 500])).toContainEqual({
  id: "schedule-001",
  perturbations: [
    { workloadId: "sqlite-migrate", phase: "ready", delayMs: 500 }
  ]
});
~~~

- [ ] **Step 2: Verify it fails**

Run: npm test -- packages/scheduler/src/candidates.test.ts

Expected: failure because the existing API uses service and ServiceSchedule.

- [ ] **Step 3: Implement generic candidates and minimization**

Replace ScheduleDimension with workload/phase selections from Workload.perturbablePhases. Preserve a zero-perturbation baseline, stable Cartesian order, perturbation removal before delay reduction, and the existing injected RunSchedule boundary.

- [ ] **Step 4: Migrate artifact/replay and fake adapter tests**

Validate FailureArtifact version 2 and target data with Zod. Pass target into discovery. Make replay receive an injected replay function and use adapter replay, not a platform-specific fake run function.

~~~
const fakePlatform: ExecutionPlatform = {
  discover: async () => workloads,
  reset: async () => undefined,
  run: async (_target, schedule) => fakeRun(schedule),
  replay: async (_target, schedule) => fakeRun(schedule)
};
~~~

- [ ] **Step 5: Verify C1**

Run: npm test -- packages/scheduler && npm run typecheck

Expected: scheduler passes without Docker and without a database name in candidate tests.

- [ ] **Step 6: Update C1 and commit**

~~~
git add packages/scheduler docs/checkpoints.md
git commit -m "feat: make scheduler workload agnostic"
~~~

### Task 4: Implement generic Compose adapter (C2, Riya)

**Files:**
- Create: packages/runtime/src/execution-platform.ts
- Create: packages/runtime/src/compose-platform.ts
- Modify: packages/runtime/src/index.ts, runtime-controller.ts, and runtime tests

**Interfaces:**
- Consumes: ExecutionPlatform, TargetConfig, Workload, and generic Schedule.
- Produces: Compose discovery, reset, run, and replay without exposing Docker concepts to the scheduler.

- [ ] **Step 1: Write failing adapter tests**

~~~
await expect(platform.discover({
  platform: "compose",
  composeFile: "fixture.yml"
})).resolves.toContainEqual(
  expect.objectContaining({ id: "api", kind: "service" })
);
await expect(platform.run(target, {
  id: "s1",
  perturbations: [{ workloadId: "api", phase: "start", delayMs: 25 }]
})).resolves.toMatchObject({ scheduleId: "s1" });
~~~

- [ ] **Step 2: Verify tests fail**

Run: npm test -- packages/runtime

Expected: failure because ComposeExecutionPlatform does not exist.

- [ ] **Step 3: Implement native translation**

Discover Compose services as service workloads. Publish only phases safely controlled by Compose. Translate generic workload IDs and phases to existing compose start/readiness control while preserving reset and observer evaluation.

- [ ] **Step 4: Verify, update C2, and commit**

Run: npm test -- packages/runtime && npm run typecheck

~~~
git add packages/runtime docs/checkpoints.md
git commit -m "feat: add compose execution platform"
~~~

### Task 5: Normalize proof evidence to workloads (C3, Shriya)

**Files:**
- Modify: packages/proof/src/runtime-proof-observer.ts, timeline.ts, oracle types, and tests

**Interfaces:**
- Consumes: adapter-normalized workload IDs.
- Produces: oracle-owned RunResult and timeline evidence with workload identity.

- [ ] **Step 1: Write failing initializer evidence test**

~~~
expect(buildTimeline([
  { timeMs: 20, workload: "sqlite-migrate", event: "ready_timeout" }
])).toEqual([
  { timeMs: 20, service: "sqlite-migrate", event: "ready_timeout" }
]);
~~~

- [ ] **Step 2: Verify test fails**

Run: npm test -- packages/proof

Expected: failure because the normalized workload observation is absent.

- [ ] **Step 3: Implement proof normalization**

Accept workload identity from the adapter; retain deterministic oracle behavior. Never classify reset or execution exceptions as a failure result.

- [ ] **Step 4: Verify, update C3, and commit**

Run: npm test -- packages/proof && npm run typecheck

~~~
git add packages/proof docs/checkpoints.md
git commit -m "feat: normalize workload proof evidence"
~~~

### Task 6: Verify real Compose discovery, artifact, and replay (C4-C5)

**Files:**
- Modify: Compose fixture and integration tests owned by Riya/Shriya
- Modify: scheduler/runtime integration tests
- Modify: docs/checkpoints.md

**Interfaces:**
- Consumes: C1-C3.
- Produces: real artifact containing target and minimized perturbations.

- [ ] **Step 1: Write the end-to-end assertion**

~~~
const result = await discoverFailure({
  target,
  candidates,
  runSchedule: platform.run.bind(platform)
});
expect(result.status).toBe("found_failure");
if (result.status === "found_failure") {
  expect(result.artifact.minimizedSchedule.perturbations.length)
    .toBeLessThanOrEqual(result.artifact.originalSchedule.perturbations.length);
}
~~~

- [ ] **Step 2: Verify it fails before fixture tuning**

Run: npm test -- integration

Expected: initial failure until baseline pass and deterministic timing failure are established.

- [ ] **Step 3: Tune only fixture, adapter controls, and probes**

Demonstrate normal pass, automatic failure discovery, minimized failure, artifact save, and replay through platform.replay. Do not add database-specific scheduler code.

- [ ] **Step 4: Verify C4 and C5**

Run: npm test && npm run build && npm run typecheck

Expected: real Compose path proves pass -> discovery -> minimize -> artifact -> replay.

- [ ] **Step 5: Update checkpoints and commit**

~~~
git add packages fixtures docs/checkpoints.md
git commit -m "test: verify generic compose race replay"
~~~

### Task 7: Add local-process adapter and fixture (C6)

**Files:**
- Create: packages/runtime/src/local-process-platform.ts, local-process-manifest.ts
- Create: fixtures/local-startup-race/manifest.json and fixture tests
- Modify: packages/runtime/src/index.ts, docs/checkpoints.md

**Interfaces:**
- Consumes: ExecutionPlatform v2.
- Produces: manifest-controlled local workloads, reset, execution, observations, and replay.

- [ ] **Step 1: Write failing manifest/discovery test**

~~~
await expect(platform.discover({
  platform: "local-process",
  manifestPath: "fixtures/local-startup-race/manifest.json"
})).resolves.toContainEqual(expect.objectContaining({
  id: "sqlite-migrate",
  kind: "initializer",
  perturbablePhases: ["ready"]
}));
~~~

- [ ] **Step 2: Verify test fails**

Run: npm test -- packages/runtime

Expected: failure because local-process platform is absent.

- [ ] **Step 3: Implement manifest-defined lifecycle control**

The manifest supplies workload IDs, commands, working directories, dependencies, and readiness probes. The adapter delays only generic phases, cleans up child processes during reset, normalizes observations, and delegates status to proof.

- [ ] **Step 4: Verify C6**

Run: npm test && npm run build && npm run typecheck

Expected: local fixture proves normal pass -> discovery -> minimize -> replay.

- [ ] **Step 5: Update C6 and commit**

~~~
git add packages/runtime packages/proof fixtures/local-startup-race docs/checkpoints.md
git commit -m "feat: add local process execution platform"
~~~

### Task 8: Keep Kubernetes as a future adapter gate (C7)

**Files:**
- Modify: docs/checkpoints.md, docs/prompts/checkpoints/C7.md

**Interfaces:**
- Produces: explicit admission criteria without Kubernetes runtime code.

- [ ] **Step 1: State admission criteria**

~~~
Start C7 only when C4 and C5 repeatedly pass and a disposable Kubernetes cluster is available. The adapter must discover Deployments, StatefulSets, and Jobs as workloads; reset namespace-scoped resources; and replay through the shared oracle path.
~~~

- [ ] **Step 2: Verify C7 remains planned**

Run: rg -n "C7|Kubernetes" docs/checkpoints.md docs/prompts/checkpoints/C7.md

Expected: C7 is planned and no Kubernetes package or cluster dependency is introduced.

- [ ] **Step 3: Commit**

~~~
git add docs/checkpoints.md docs/prompts/checkpoints/C7.md
git commit -m "docs: define kubernetes adapter admission criteria"
~~~

## Plan Self-Review

- Spec coverage: Task 1 implements checkpoint reporting/prompts; Task 2 the coordinated contract migration; Task 3 Akil's generic engine; Tasks 4-5 adapter/oracle ownership; Tasks 6-7 Compose/local proof; Task 8 future Kubernetes constraint.
- Placeholder scan: every task provides explicit files, tests, commands, and commit scope.
- Type consistency: Workload, Perturbation, TargetConfig, Schedule, ExecutionPlatform, and FailureArtifact v2 originate in Task 2 and are used consistently thereafter.
