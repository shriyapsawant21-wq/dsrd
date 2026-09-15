import type { Workload } from "./index.js";
import type { ExperimentPolicy, ReadinessAssertion } from "./repository.js";
import type { RunDiagnostic } from "./index.js";

export type WorkloadCapability = { workloadId: string; mechanism: "start-delay" | "readiness-delay" | "job-observation" | "probe"; observerLocations: Array<"host" | "target-network"> };
export type WorkloadModel = { workloads: Workload[]; assertions: ReadinessAssertion[]; capabilities: WorkloadCapability[]; statePolicy: "fresh-owned" | "configured-reset"; digest: string };
export type PreparedTarget = { handleId: string; model: WorkloadModel; adapterKind: "compose" | "local-process" | "kubernetes"; adapterVersion: string; environmentDigest: string };
export type AttemptHandle = { handleId: string; attemptId: string };
export type AttemptContext = { experimentId: string; attemptId: string; workspace: string; signal: AbortSignal; policy: ExperimentPolicy; bindings: Record<string, string> };
export type CleanupReport = { removed: Array<{ kind: string; id: string }>; remaining: Array<{ kind: string; id: string }>; diagnostics: RunDiagnostic[] };
export type AppliedPerturbation = { workloadId: string; phase: "start" | "ready"; requestedDelayMs: number; eligibleAtMs: number; appliedAtMs: number; releasedAtMs: number; mechanism: "start-delay" | "readiness-delay" };
