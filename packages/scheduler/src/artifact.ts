import { readFile, writeFile } from "node:fs/promises";

import type { FailureArtifact } from "@dsrd/contracts";
import { z } from "zod";

const scheduleSchema = z.object({
  id: z.string().min(1),
  perturbations: z.array(
    z.object({
      workloadId: z.string().min(1),
      phase: z.enum(["start", "ready"]),
      delayMs: z.number().nonnegative()
    })
  )
});

const targetSchema = z.discriminatedUnion("platform", [
  z.object({ platform: z.literal("compose"), composeFile: z.string().min(1) }),
  z.object({ platform: z.literal("local-process"), manifestPath: z.string().min(1) }),
  z.object({
    platform: z.literal("kubernetes"),
    manifestPath: z.string().min(1),
    namespace: z.string().min(1).optional()
  })
]);

export const failureArtifactSchema = z.object({
  version: z.literal(2),
  createdAt: z.string().datetime(),
  target: targetSchema,
  originalSchedule: scheduleSchema,
  minimizedSchedule: scheduleSchema,
  expectedFailureReason: z.string().optional(),
  events: z.array(
    z.object({
      timeMs: z.number(),
      service: z.string(),
      event: z.string(),
      detail: z.string().optional()
    })
  )
});

export type CreateFailureArtifactInput = Omit<FailureArtifact, "version">;

export function createFailureArtifact(
  input: CreateFailureArtifactInput
): FailureArtifact {
  return failureArtifactSchema.parse({ version: 2, ...input });
}

export async function saveFailureArtifact(
  path: string,
  artifact: FailureArtifact
): Promise<void> {
  const validated = failureArtifactSchema.parse(artifact);
  await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
}

export async function loadFailureArtifact(path: string): Promise<FailureArtifact> {
  const contents = await readFile(path, "utf8");
  return failureArtifactSchema.parse(JSON.parse(contents));
}
