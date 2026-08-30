import { describe, expect, it } from "vitest";

import {
  parseFailureArtifact,
  parseSearchRequest
} from "../src/validation.js";

describe("web backend request validation", () => {
  it("accepts a Compose search with bounded integer delay options", () => {
    expect(parseSearchRequest({
      target: { platform: "compose", composeFile: "compose.yaml" },
      delayOptionsMs: [0, 500, 3_000]
    })).toEqual({
      target: { platform: "compose", composeFile: "compose.yaml" },
      delayOptionsMs: [0, 500, 3_000]
    });
  });

  it.each([
    [],
    [-1],
    [1.5],
    [Number.POSITIVE_INFINITY],
    [60_001]
  ])("rejects unsafe delay options %j", (delayOptionsMs) => {
    expect(() => parseSearchRequest({
      target: { platform: "compose", composeFile: "compose.yaml" },
      delayOptionsMs
    })).toThrow();
  });

  it("rejects malformed target configuration", () => {
    expect(() => parseSearchRequest({
      target: { platform: "compose", composeFile: "" },
      delayOptionsMs: [0]
    })).toThrow();
  });

  it("accepts a valid v2 failure artifact", () => {
    const artifact = {
      version: 2,
      createdAt: "2026-08-30T00:00:00.000Z",
      target: { platform: "compose", composeFile: "compose.yaml" },
      originalSchedule: { id: "failure", perturbations: [] },
      minimizedSchedule: { id: "failure-minimized", perturbations: [] },
      events: []
    };

    expect(parseFailureArtifact(artifact)).toEqual(artifact);
  });

  it("rejects non-v2 artifacts", () => {
    expect(() => parseFailureArtifact({
      version: 1,
      createdAt: "2026-08-30T00:00:00.000Z",
      target: { platform: "compose", composeFile: "compose.yaml" },
      originalSchedule: { id: "failure", perturbations: [] },
      minimizedSchedule: { id: "failure-minimized", perturbations: [] },
      events: []
    })).toThrow();
  });
});
