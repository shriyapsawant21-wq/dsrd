import { describe, expect, it } from "vitest";
import type { Workload } from "@dsrd/contracts";

import { generateAdaptiveCandidateStages, generateCandidates, generateFocusedCandidates } from "./candidates.js";

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

describe("generateAdaptiveCandidateStages", () => {
  it("creates baseline and isolated schedules before pairwise schedules", () => {
    const workloads: Workload[] = [
      { id: "database", kind: "service", perturbablePhases: ["start"] },
      { id: "api", kind: "service", perturbablePhases: ["start"] },
    ];
    const stages = generateAdaptiveCandidateStages(workloads, [0, 500]);

    expect(stages.map(({ name }) => name)).toEqual(["isolated", "pairwise", "full"]);
    expect([...stages[0].create()]).toEqual([
      { id: "adaptive-000", perturbations: [] },
      { id: "adaptive-001", perturbations: [{ workloadId: "database", phase: "start", delayMs: 500 }] },
      { id: "adaptive-002", perturbations: [{ workloadId: "api", phase: "start", delayMs: 500 }] },
    ]);
    expect([...stages[1].create()]).toEqual([
      { id: "adaptive-pair-0-1-0-0", perturbations: [
        { workloadId: "database", phase: "start", delayMs: 500 },
        { workloadId: "api", phase: "start", delayMs: 500 },
      ] },
    ]);
  });

  it("does not materialize the full Cartesian stage until requested", () => {
    const workloads: Workload[] = Array.from({ length: 8 }, (_, index) => ({
      id: `service-${index}`,
      kind: "service" as const,
      perturbablePhases: ["start" as const],
    }));
    const stages = generateAdaptiveCandidateStages(workloads, [0, 500, 1000]);

    expect(stages[2].candidateCount).toBe(3 ** 8);
    expect(stages[2].create).toBeTypeOf("function");
  });
});
