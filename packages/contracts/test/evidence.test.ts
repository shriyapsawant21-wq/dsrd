import { describe, expect, it } from "vitest";

import { failureArtifactSchema } from "@dsrd/contracts";

describe("failure artifact schema", () => {
  const v2Artifact = {
    version: 2,
    createdAt: "2026-09-12T00:00:00.000Z",
    target: { platform: "compose", composeFile: "compose.yaml" },
    originalSchedule: { id: "candidate", perturbations: [] },
    minimizedSchedule: { id: "minimal", perturbations: [] },
    events: [],
  };

  it("accepts legacy v2 artifacts without treating them as v3 verified evidence", () => {
    const parsed = failureArtifactSchema.parse(v2Artifact);

    expect(parsed.version).toBe(2);
    expect("verification" in parsed).toBe(false);
  });
});
