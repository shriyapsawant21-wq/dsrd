import { readFile, writeFile } from "node:fs/promises";

import type { FailureArtifact } from "@dsrd/contracts";
import { z } from "zod";

const serviceScheduleSchema = z.object({
  startDelayMs: z.number().nonnegative().optional(),
  readinessDelayMs: z.number().nonnegative().optional()
});

const scheduleSchema = z.object({
  id: z.string().min(1),
  services: z.record(z.string(), serviceScheduleSchema)
});

export const failureArtifactSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().datetime(),
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
  return failureArtifactSchema.parse({ version: 1, ...input });
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
