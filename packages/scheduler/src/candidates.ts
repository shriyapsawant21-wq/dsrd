import type { Schedule, Workload } from "@dsrd/contracts";

export type CandidateStage = {
  name: "isolated" | "pairwise" | "full";
  candidateCount: number;
  create: () => Iterable<Schedule>;
};

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

/** Builds an adaptive plan: isolated candidates, then pairs, then full fallback. */
export function generateAdaptiveCandidateStages(
  workloads: readonly Workload[],
  delayOptionsMs: readonly number[],
): CandidateStage[] {
  const dimensions = workloads.flatMap((workload) =>
    workload.perturbablePhases.map((phase) => ({ workloadId: workload.id, phase }))
  );
  const delays = uniqueDelays(delayOptionsMs);
  const positiveDelays = delays.filter((delayMs) => delayMs > 0);
  const isolated = [
    { id: "adaptive-000", perturbations: [] },
    ...dimensions.flatMap((dimension, dimensionIndex) =>
      positiveDelays.map((delayMs, delayIndex) => ({
        id: `adaptive-${(1 + dimensionIndex * positiveDelays.length + delayIndex).toString().padStart(3, "0")}`,
        perturbations: [{ ...dimension, delayMs }],
      }))
    ),
  ];
  const pairwise = dimensions.flatMap((left, leftIndex) =>
    dimensions.slice(leftIndex + 1).flatMap((right, rightIndex) =>
      positiveDelays.flatMap((leftDelay, leftDelayIndex) =>
        positiveDelays.map((rightDelay, rightDelayIndex) => ({
          id: `adaptive-pair-${leftIndex}-${leftIndex + rightIndex + 1}-${leftDelayIndex}-${rightDelayIndex}`,
          perturbations: [
            { ...left, delayMs: leftDelay },
            { ...right, delayMs: rightDelay },
          ],
        }))
      )
    )
  );
  const fullCandidateCount = delays.length ** dimensions.length;

  return [
    { name: "isolated", candidateCount: isolated.length, create: () => isolated },
    { name: "pairwise", candidateCount: pairwise.length, create: () => pairwise },
    {
      name: "full",
      candidateCount: fullCandidateCount,
      create: () => fullSchedules(dimensions, delays),
    },
  ];
}

function uniqueDelays(delayOptionsMs: readonly number[]): number[] {
  return [...new Set(delayOptionsMs)].filter((delayMs) => Number.isFinite(delayMs) && delayMs >= 0);
}

function* fullSchedules(
  dimensions: ReadonlyArray<{ workloadId: string; phase: "start" | "ready" }>,
  delays: readonly number[],
): Iterable<Schedule> {
  let index = 0;
  for (const values of valueCombinations(dimensions.length, delays)) {
    yield {
      id: `adaptive-full-${(index++).toString().padStart(3, "0")}`,
      perturbations: dimensions.flatMap((dimension, dimensionIndex) => {
        const delayMs = values[dimensionIndex];
        return delayMs === 0 ? [] : [{ ...dimension, delayMs }];
      }),
    };
  }
}

function* valueCombinations(size: number, values: readonly number[], prefix: number[] = []): Iterable<number[]> {
  if (prefix.length === size) {
    yield prefix;
    return;
  }
  for (const value of values) {
    yield* valueCombinations(size, values, [...prefix, value]);
  }
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
