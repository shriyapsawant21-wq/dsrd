import { describe, expect, it } from "vitest";

import { generateCandidates } from "./candidates.js";

describe("generateCandidates", () => {
  it("creates a deterministic bounded grid with a baseline schedule", () => {
    const schedules = generateCandidates({
      delayOptionsMs: [0, 500],
      dimensions: [
        { service: "postgres", field: "readinessDelayMs" },
        { service: "api", field: "startDelayMs" }
      ]
    });

    expect(schedules).toEqual([
      { id: "schedule-000", services: {} },
      {
        id: "schedule-001",
        services: { api: { startDelayMs: 500 } }
      },
      {
        id: "schedule-002",
        services: { postgres: { readinessDelayMs: 500 } }
      },
      {
        id: "schedule-003",
        services: {
          api: { startDelayMs: 500 },
          postgres: { readinessDelayMs: 500 }
        }
      }
    ]);
  });
});
