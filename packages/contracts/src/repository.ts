import { z } from "zod";
import type { RunDiagnostic } from "./index.js";

const identifierSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const relativePathSchema = z.string().min(1).refine(
  (value) => !value.startsWith("/") && !value.split(/[\\/]/).includes(".."),
  "must be a contained relative path",
);
const positiveIntegerSchema = z.number().int().positive();

export const repositoryInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("checkout"), path: z.string().min(1) }).strict(),
  z.object({
    kind: z.literal("git"),
    url: z.string().url().refine((value) => {
      try {
        const parsed = new URL(value);
        return parsed.username.length === 0 && parsed.password.length === 0;
      } catch {
        return false;
      }
    }, "must not contain embedded credentials"),
    ref: z.string().min(1),
    submodules: z.boolean(),
    lfs: z.boolean(),
  }).strict(),
]);
export type RepositoryInput = z.infer<typeof repositoryInputSchema>;

export const runDiagnosticSchema = z.object({
  code: identifierSchema,
  message: z.string().min(1),
  path: z.array(z.string()).default([]),
}).strict();

export const targetCandidateSchema = z.object({
  id: identifierSchema,
  adapter: z.enum(["compose", "local-process", "kubernetes"]),
  root: relativePathSchema,
  launchFiles: z.array(relativePathSchema).min(1),
  requirements: z.array(z.string().min(1)).default([]),
  evidence: z.array(relativePathSchema).min(1),
}).strict();
export type TargetCandidate = z.infer<typeof targetCandidateSchema>;

export const inspectionResultSchema = z.object({
  snapshotId: identifierSchema,
  candidates: z.array(targetCandidateSchema),
  suggestions: z.array(z.string()),
  truncated: z.boolean(),
  diagnostics: z.array(runDiagnosticSchema),
}).strict();
export type InspectionResult = z.infer<typeof inspectionResultSchema>;

const dependencySchema = z.object({
  workloadId: identifierSchema,
  condition: z.enum(["service_started", "service_healthy", "service_completed_successfully"]),
}).strict();
const readinessSchema = z.discriminatedUnion("type", [
  z.object({ id: identifierSchema, type: z.literal("http"), url: z.string().url(), observer: z.enum(["host", "target-network"]), expectedStatus: z.number().int().min(100).max(599) }).strict(),
  z.object({ id: identifierSchema, type: z.literal("tcp"), host: z.string().min(1), port: z.number().int().min(1).max(65535), observer: z.enum(["host", "target-network"]) }).strict(),
  z.object({ id: identifierSchema, type: z.literal("native-health"), observer: z.literal("target-network") }).strict(),
]);
export type ReadinessAssertion = z.infer<typeof readinessSchema>;

const workloadConfigSchema = z.object({
  kind: z.enum(["service", "process", "job", "initializer"]),
  command: z.array(z.string().min(1)).min(1).optional(),
  cwd: relativePathSchema.optional(),
  dependsOn: z.array(dependencySchema).default([]),
  readiness: readinessSchema.optional(),
  expectedExitCodes: z.array(z.number().int()).min(1).optional(),
  envBindings: z.record(identifierSchema, z.string().min(1)).default({}),
}).strict();
export type WorkloadConfig = z.infer<typeof workloadConfigSchema>;

const defaultTimeouts = { acquisitionMs: 300000, preflightMs: 300000, runMs: 60000, readinessMs: 30000, cleanupMs: 30000 };
const defaultPolicy = { dependencyPolicy: "declared" as const, baselineRuns: 3, confirmationRuns: 3, replayRuns: 3, maxExecutions: 50, maxInFlight: 1, delayOptionsMs: [0, 500, 1000, 2000], timeouts: defaultTimeouts };

export const experimentPolicySchema = z.object({
  dependencyPolicy: z.literal("declared").default("declared"),
  baselineRuns: positiveIntegerSchema.default(3),
  confirmationRuns: positiveIntegerSchema.default(3),
  replayRuns: positiveIntegerSchema.default(3),
  maxExecutions: positiveIntegerSchema.default(50),
  maxInFlight: positiveIntegerSchema.default(1),
  delayOptionsMs: z.array(z.number().int().nonnegative()).min(1).default([0, 500, 1000, 2000]),
  timeouts: z.object({
    acquisitionMs: positiveIntegerSchema.default(300000), preflightMs: positiveIntegerSchema.default(300000),
    runMs: positiveIntegerSchema.default(60000), readinessMs: positiveIntegerSchema.default(30000), cleanupMs: positiveIntegerSchema.default(30000),
  }).strict().default(defaultTimeouts),
}).strict();
export type ExperimentPolicy = z.infer<typeof experimentPolicySchema>;
export const defaultExperimentPolicy: ExperimentPolicy = experimentPolicySchema.parse(defaultPolicy);

export const projectConfigSchema = z.object({
  version: z.literal(1),
  target: z.object({
    id: identifierSchema, adapter: z.enum(["compose", "local-process", "kubernetes"]), root: relativePathSchema,
    files: z.array(relativePathSchema).min(1).optional(), envFiles: z.array(relativePathSchema).default([]),
    profiles: z.array(z.string().min(1)).default([]), prepareCommands: z.array(z.array(z.string().min(1)).min(1)).default([]),
  }).strict(),
  workloads: z.record(identifierSchema, workloadConfigSchema).default({}),
  bindings: z.record(identifierSchema, z.object({ type: z.enum(["allocated-port", "secret", "environment"]), required: z.boolean().default(true) }).strict()).default({}),
  state: z.object({ policy: z.enum(["fresh-owned", "configured-reset"]), resetCommand: z.array(z.string().min(1)).min(1).optional() }).strict(),
  experiment: experimentPolicySchema.default(defaultPolicy),
}).strict().superRefine((config, context) => {
  if (config.target.adapter === "compose" && !config.target.files?.length) context.addIssue({ code: "custom", path: ["target", "files"], message: "Compose targets require at least one launch file" });
  const ids = new Set(Object.keys(config.workloads));
  for (const [id, workload] of Object.entries(config.workloads)) {
    for (const dependency of workload.dependsOn) if (!ids.has(dependency.workloadId)) context.addIssue({ code: "custom", path: ["workloads", id, "dependsOn"], message: `unknown workload dependency: ${dependency.workloadId}` });
    if ((workload.kind === "service" || workload.kind === "process") && config.target.adapter === "local-process" && !workload.readiness) context.addIssue({ code: "custom", path: ["workloads", id, "readiness"], message: "local long-running workloads require readiness" });
  }
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export function parseProjectConfig(input: unknown): ProjectConfig {
  return projectConfigSchema.parse(input);
}
