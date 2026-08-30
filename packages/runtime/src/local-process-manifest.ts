import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { Workload } from "@dsrd/contracts";

export type LocalProcessWorkload = Workload & {
  command: string[];
  cwd?: string;
  environment?: Record<string, string>;
};

export type LocalProcessManifest = {
  workloads: LocalProcessWorkload[];
  resetCommand?: string[];
};

export type LoadedLocalProcessManifest = LocalProcessManifest & { directory: string };

export async function loadLocalProcessManifest(manifestPath: string): Promise<LoadedLocalProcessManifest> {
  const directory = dirname(resolve(manifestPath));
  const parsed: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!isManifest(parsed)) throw new Error(`Invalid local-process manifest: ${manifestPath}`);
  return { ...parsed, directory };
}

function isManifest(value: unknown): value is LocalProcessManifest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { workloads?: unknown; resetCommand?: unknown };
  return Array.isArray(candidate.workloads) &&
    candidate.workloads.every(isWorkload) &&
    (candidate.resetCommand === undefined || isCommand(candidate.resetCommand));
}

function isWorkload(value: unknown): value is LocalProcessWorkload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<LocalProcessWorkload>;
  return typeof candidate.id === "string" &&
    (candidate.kind === "service" || candidate.kind === "process" || candidate.kind === "job" || candidate.kind === "initializer") &&
    Array.isArray(candidate.perturbablePhases) &&
    candidate.perturbablePhases.every((phase) => phase === "start" || phase === "ready") &&
    isCommand(candidate.command) &&
    (candidate.dependsOn === undefined || (Array.isArray(candidate.dependsOn) && candidate.dependsOn.every((dependency) => typeof dependency === "string")));
}

function isCommand(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((part) => typeof part === "string" && part.length > 0);
}
