import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createFailureArtifact,
  loadFailureArtifact,
  saveFailureArtifact
} from "./artifact.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true })));
  temporaryDirectories.length = 0;
});

describe("failure artifacts", () => {
  it("persists and validates the shared failure artifact shape", async () => {
    const artifact = createFailureArtifact({
      createdAt: "2026-08-29T00:00:00.000Z",
      target: { platform: "local-process", manifestPath: "race.json" },
      originalSchedule: {
        id: "schedule-003",
        perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }]
      },
      minimizedSchedule: {
        id: "schedule-003-minimized",
        perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 500 }]
      },
      expectedFailureReason: "bootstrap unavailable",
      events: [{ timeMs: 500, service: "api", event: "startup_failed" }]
    });
    const directory = await mkdtemp(join(tmpdir(), "dsrd-artifact-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "failure.json");

    await saveFailureArtifact(path, artifact);

    await expect(loadFailureArtifact(path)).resolves.toEqual(artifact);
  });
});
