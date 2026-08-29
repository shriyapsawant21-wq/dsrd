import type { Schedule, ServiceSchedule } from "@dsrd/contracts";

export type ScheduleDimension = {
  service: string;
  field: keyof ServiceSchedule;
};

export type CandidateOptions = {
  delayOptionsMs: readonly number[];
  dimensions: readonly ScheduleDimension[];
};

/** Generates a stable, bounded Cartesian grid of startup perturbations. */
export function generateCandidates(options: CandidateOptions): Schedule[] {
  const valueCombinations = cartesianProduct(
    options.dimensions.map(() => options.delayOptionsMs)
  );

  return valueCombinations.map((values, index) => ({
    id: `schedule-${index.toString().padStart(3, "0")}`,
    services: toServices(options.dimensions, values)
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

function toServices(
  dimensions: readonly ScheduleDimension[],
  values: readonly number[]
): Schedule["services"] {
  return dimensions.reduce<Schedule["services"]>((services, dimension, index) => {
    const value = values[index];
    if (value === 0) {
      return services;
    }

    return {
      ...services,
      [dimension.service]: {
        ...services[dimension.service],
        [dimension.field]: value
      }
    };
  }, {});
}
