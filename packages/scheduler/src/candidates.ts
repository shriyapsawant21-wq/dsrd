import type { Schedule, Workload } from "@dsrd/contracts";

/** Generates a stable, bounded Cartesian grid of startup perturbations. */
export function generateCandidates(
  workloads: readonly Workload[],
  delayOptionsMs: readonly number[]
): Schedule[] {
  const dimensions = workloads.flatMap((workload) =>
    workload.perturbablePhases.map((phase) => ({ workloadId: workload.id, phase }))
  );
  const valueCombinations = cartesianProduct(dimensions.map(() => delayOptionsMs));

  return valueCombinations.map((values, index) => ({
    id: `schedule-${index.toString().padStart(3, "0")}`,
    perturbations: dimensions.flatMap((dimension, dimensionIndex) => {
      const delayMs = values[dimensionIndex];
      return delayMs === 0 ? [] : [{ ...dimension, delayMs }];
    })
  }));
}

/** Generates a fast baseline plus isolated single-perturbation schedules. */
export function generateFocusedCandidates(
  workloads: readonly Workload[],
  delayOptionsMs: readonly number[]
): Schedule[] {
  const delays = [...new Set(delayOptionsMs)].filter((delayMs) => delayMs > 0);
  const perturbations = workloads.flatMap((workload) =>
    workload.perturbablePhases.flatMap((phase) =>
      delays.map((delayMs) => ({ workloadId: workload.id, phase, delayMs }))
    )
  );
  return [
    { id: "quick-000", perturbations: [] },
    ...perturbations.map((perturbation, index) => ({
      id: `quick-${(index + 1).toString().padStart(3, "0")}`,
      perturbations: [perturbation]
    }))
  ];
}

function cartesianProduct<T>(sets: readonly (readonly T[])[]): T[][] {
  return sets.reduce<T[][]>(
    (combinations, values) =>
      combinations.flatMap((combination) =>
        values.map((value) => [...combination, value])
      ),
    [[]]
  );
}
