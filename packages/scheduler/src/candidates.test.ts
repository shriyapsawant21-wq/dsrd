import { describe, expect, it } from "vitest";
import type { Workload } from "@dsrd/contracts";

import { generateCandidates, generateFocusedCandidates } from "./candidates.js";

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

describe("generateFocusedCandidates", () => {
  it("tests a baseline and one perturbation at a time", () => {
    const workloads: Workload[] = [
      { id: "postgres", kind: "service", perturbablePhases: ["start"] },
      { id: "api", kind: "service", perturbablePhases: ["start"] },
    ];

    expect(generateFocusedCandidates(workloads, [0, 2500])).toEqual([
      { id: "quick-000", perturbations: [] },
      { id: "quick-001", perturbations: [{ workloadId: "postgres", phase: "start", delayMs: 2500 }] },
      { id: "quick-002", perturbations: [{ workloadId: "api", phase: "start", delayMs: 2500 }] },
    ]);
  });
});
