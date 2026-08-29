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

function cartesianProduct<T>(sets: readonly (readonly T[])[]): T[][] {
  return sets.reduce<T[][]>(
    (combinations, values) =>
      combinations.flatMap((combination) =>
        values.map((value) => [...combination, value])
      ),
    [[]]
  );
}
