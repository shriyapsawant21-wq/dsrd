import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createFailureArtifact,
  createVerifiedFailureArtifact,
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

  it("persists a validated v3 artifact with replay and provenance evidence", async () => {
    const artifact = createVerifiedFailureArtifact({
      createdAt: "2026-09-12T00:00:00.000Z",
      target: { platform: "local-process", manifestPath: "race.json" },
      originalSchedule: { id: "candidate", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 1000 }] },
      minimizedSchedule: { id: "minimal", perturbations: [{ workloadId: "bootstrap", phase: "ready", delayMs: 500 }] },
      events: [{ timeMs: 100, service: "bootstrap", event: "readiness_withheld" }, { timeMs: 200, service: "api", event: "startup_failed" }],
      repository: { snapshotId: "snapshot:fixture", contentDigest: "a".repeat(64), resolvedRevision: "deadbeef" },
      selectedTarget: { id: "process:fixture", adapter: "local-process", root: ".", launchFiles: ["manifest.json"], requirements: [], evidence: ["manifest.json"] },
      configDigest: "b".repeat(64),
      modelDigest: "c".repeat(64),
      environmentDigest: "d".repeat(64),
      requiredBindings: ["DATABASE_URL"],
      policy: { baselineRuns: 3, confirmationRuns: 3, replayRuns: 3 },
      signature: { workloadId: "api", assertionId: "structured:startup_failed", category: "structured_failure", code: "startup_failed" },
      orderingConstraints: [{ before: { workloadId: "bootstrap", event: "readiness_withheld", occurrence: 0 }, after: { workloadId: "api", event: "startup_failed", occurrence: 0 } }],
      verification: { baselineRuns: 3, confirmationRuns: 3, replayRuns: 3 },
    });
    const directory = await mkdtemp(join(tmpdir(), "dsrd-artifact-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "failure-v3.json");

    await saveFailureArtifact(path, artifact);

    await expect(loadFailureArtifact(path)).resolves.toEqual(artifact);
  });
});
