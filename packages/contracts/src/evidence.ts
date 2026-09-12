import { z } from "zod";
import type { CleanupReport, AppliedPerturbation } from "./execution.js";
import type { ExperimentPolicy, ProjectConfig, TargetCandidate } from "./repository.js";

export type FailureSignature = { workloadId: string; assertionId: string; category: "unexpected_exit" | "readiness_failed" | "structured_failure" | "job_exit"; code?: string };
export type OrderingPredicate = { workloadId: string; event: string; occurrence: number };
export type OrderingConstraint = { before: OrderingPredicate; after: OrderingPredicate };

const scheduleSchema = z.object({ id: z.string().min(1), perturbations: z.array(z.object({ workloadId: z.string().min(1), phase: z.enum(["start", "ready"]), delayMs: z.number().int().nonnegative() }).strict()) }).strict();
const targetSchema = z.discriminatedUnion("platform", [z.object({ platform: z.literal("compose"), composeFile: z.string().min(1) }).strict(), z.object({ platform: z.literal("local-process"), manifestPath: z.string().min(1) }).strict(), z.object({ platform: z.literal("kubernetes"), manifestPath: z.string().min(1), namespace: z.string().min(1).optional() }).strict()]);
const eventSchema = z.object({ timeMs: z.number(), service: z.string(), event: z.string(), detail: z.string().optional(), eventId: z.string().optional(), sequence: z.number().int().nonnegative().optional() }).strict();
export const failureArtifactV2Schema = z.object({ version: z.literal(2), createdAt: z.string().datetime(), target: targetSchema, originalSchedule: scheduleSchema, minimizedSchedule: scheduleSchema, expectedFailureReason: z.string().optional(), events: z.array(eventSchema) }).strict();
export const failureArtifactV3Schema = failureArtifactV2Schema.extend({ version: z.literal(3), repository: z.object({ snapshotId: z.string().min(1), contentDigest: z.string().min(1), origin: z.string().url().optional(), resolvedRevision: z.string().min(1).optional() }).strict(), selectedTarget: z.object({ id: z.string(), adapter: z.enum(["compose", "local-process", "kubernetes"]), root: z.string(), launchFiles: z.array(z.string()), requirements: z.array(z.string()), evidence: z.array(z.string()) }).strict(), configDigest: z.string().min(1), modelDigest: z.string().min(1), environmentDigest: z.string().min(1), requiredBindings: z.array(z.string().min(1)), policy: z.unknown(), signature: z.object({ workloadId: z.string(), assertionId: z.string(), category: z.enum(["unexpected_exit", "readiness_failed", "structured_failure", "job_exit"]), code: z.string().optional() }).strict(), orderingConstraints: z.array(z.object({ before: z.object({ workloadId: z.string(), event: z.string(), occurrence: z.number().int().nonnegative() }).strict(), after: z.object({ workloadId: z.string(), event: z.string(), occurrence: z.number().int().nonnegative() }).strict() }).strict()).min(1), verification: z.object({ baselineRuns: z.number().int().positive(), confirmationRuns: z.number().int().positive(), replayRuns: z.number().int().positive() }).strict() }).strict();
export const failureArtifactSchema = z.union([failureArtifactV2Schema, failureArtifactV3Schema]);
export type FailureArtifactV2 = { version: 2; createdAt: string; target: z.infer<typeof targetSchema>; originalSchedule: z.infer<typeof scheduleSchema>; minimizedSchedule: z.infer<typeof scheduleSchema>; expectedFailureReason?: string; events: z.infer<typeof eventSchema>[] };
export type FailureArtifactV3 = z.infer<typeof failureArtifactV3Schema>;
export type FailureArtifact = FailureArtifactV2 | FailureArtifactV3;
export type RunEvidence = { failureSignature?: FailureSignature; cleanup?: CleanupReport; appliedPerturbations?: AppliedPerturbation[] };
export type VerifiedArtifactContext = { config: ProjectConfig; target: TargetCandidate; policy: ExperimentPolicy };
