import type { Schedule, ServiceSchedule } from "@dsrd/contracts";

import type { RunSchedule } from "./search.js";

type Perturbation = {
  service: string;
  field: keyof ServiceSchedule;
  value: number;
};

/** Greedily finds a smaller schedule that the supplied oracle still classifies as failed. */
export async function minimizeSchedule(
  failingSchedule: Schedule,
  runSchedule: RunSchedule,
  delayOptionsMs: readonly number[]
): Promise<Schedule> {
  let perturbations = listPerturbations(failingSchedule);

  for (const perturbation of [...perturbations]) {
    const candidate = perturbations.filter((item) => item !== perturbation);
    if (await fails(toSchedule(failingSchedule.id, candidate), runSchedule)) {
      perturbations = candidate;
    }
  }

  for (const perturbation of [...perturbations]) {
    for (const lowerValue of lowerDelays(perturbation.value, delayOptionsMs)) {
      const candidate = perturbations.map((item) =>
        item === perturbation ? { ...item, value: lowerValue } : item
      );
      if (await fails(toSchedule(failingSchedule.id, candidate), runSchedule)) {
        perturbations = candidate;
        perturbation.value = lowerValue;
        break;
      }
    }
  }

  return {
    ...toSchedule(failingSchedule.id, perturbations),
    id: `${failingSchedule.id}-minimized`
  };
}

function listPerturbations(schedule: Schedule): Perturbation[] {
  return Object.entries(schedule.services).flatMap(([service, delays]) =>
    (Object.entries(delays) as [keyof ServiceSchedule, number | undefined][])
      .filter(([, value]) => value !== undefined && value !== 0)
      .map(([field, value]) => ({ service, field, value: value as number }))
  );
}

function toSchedule(id: string, perturbations: readonly Perturbation[]): Schedule {
  const services: Schedule["services"] = {};
  for (const perturbation of perturbations) {
    services[perturbation.service] = {
      ...services[perturbation.service],
      [perturbation.field]: perturbation.value
    };
  }
  return { id, services };
}

function lowerDelays(currentValue: number, delayOptionsMs: readonly number[]): number[] {
  return [...new Set(delayOptionsMs)]
    .filter((value) => value > 0 && value < currentValue)
    .sort((left, right) => left - right);
}

async function fails(schedule: Schedule, runSchedule: RunSchedule): Promise<boolean> {
  return (await runSchedule(schedule)).status === "fail";
}
