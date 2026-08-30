import type { FailureArtifact } from "@dsrd/contracts";
import { failureArtifactSchema } from "@dsrd/scheduler";
import { z } from "zod";

import type { SearchRequest } from "./types.js";

const targetSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("compose"),
    composeFile: z.string().min(1)
  }),
  z.object({
    platform: z.literal("local-process"),
    manifestPath: z.string().min(1)
  }),
  z.object({
    platform: z.literal("kubernetes"),
    manifestPath: z.string().min(1),
    namespace: z.string().min(1).optional()
  })
]);

const searchRequestSchema = z.object({
  target: targetSchema,
  delayOptionsMs: z.array(
    z.number().int().min(0).max(60_000)
  ).min(1).max(100)
});

export function parseSearchRequest(value: unknown): SearchRequest {
  return searchRequestSchema.parse(value);
}

export function parseFailureArtifact(value: unknown): FailureArtifact {
  return failureArtifactSchema.parse(value);
}
