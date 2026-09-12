import { readFile, writeFile } from "node:fs/promises";

import { failureArtifactSchema, failureArtifactV2Schema, type FailureArtifact, type FailureArtifactV2 } from "@dsrd/contracts";

export { failureArtifactSchema };

export type CreateFailureArtifactInput = Omit<FailureArtifactV2, "version">;

export function createFailureArtifact(
  input: CreateFailureArtifactInput
): FailureArtifactV2 {
  return failureArtifactV2Schema.parse({ version: 2, ...input });
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
