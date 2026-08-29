import { describe, expect, it } from "vitest";
import type { Workload } from "@dsrd/contracts";

import { generateCandidates } from "./candidates.js";

describe("generateCandidates", () => {
  it("creates a deterministic bounded workload-phase grid with a baseline", () => {
    const workloads: Workload[] = [
      { id: "migration", kind: "initializer", perturbablePhases: ["ready"] },
      { id: "api", kind: "service", perturbablePhases: ["start"] }
    ];
    const schedules = generateCandidates(workloads, [0, 500]);

    expect(schedules).toEqual([
      { id: "schedule-000", perturbations: [] },
      {
        id: "schedule-001",
        perturbations: [{ workloadId: "api", phase: "start", delayMs: 500 }]
      },
      {
        id: "schedule-002",
        perturbations: [{ workloadId: "migration", phase: "ready", delayMs: 500 }]
      },
      {
        id: "schedule-003",
        perturbations: [
          { workloadId: "migration", phase: "ready", delayMs: 500 },
          { workloadId: "api", phase: "start", delayMs: 500 }
        ]
      }
    ]);
  });
});
