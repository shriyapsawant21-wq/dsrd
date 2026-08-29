import type { Perturbation, Schedule, TargetConfig } from "@dsrd/contracts";

import type { RunSchedule } from "./search.js";

/** Greedily finds a smaller schedule that the supplied oracle still classifies as failed. */
export async function minimizeSchedule(
  failingSchedule: Schedule,
  target: TargetConfig,
  runSchedule: RunSchedule,
  delayOptionsMs: readonly number[]
): Promise<Schedule> {
  let perturbations = [...failingSchedule.perturbations];

  for (const perturbation of [...perturbations]) {
    const candidate = perturbations.filter((item) => item !== perturbation);
    if (await fails(toSchedule(failingSchedule.id, candidate), target, runSchedule)) {
      perturbations = candidate;
    }
  }

  for (const perturbation of [...perturbations]) {
    for (const delayMs of lowerDelays(perturbation.delayMs, delayOptionsMs)) {
      const candidate = perturbations.map((item) =>
        item === perturbation ? { ...item, delayMs } : item
      );
      if (await fails(toSchedule(failingSchedule.id, candidate), target, runSchedule)) {
        perturbations = candidate;
        break;
      }
    }
  }

  return { ...toSchedule(failingSchedule.id, perturbations), id: `${failingSchedule.id}-minimized` };
}

function toSchedule(id: string, perturbations: readonly Perturbation[]): Schedule {
  return { id, perturbations: [...perturbations] };
}

function lowerDelays(currentDelayMs: number, delayOptionsMs: readonly number[]): number[] {
  return [...new Set(delayOptionsMs)]
    .filter((delayMs) => delayMs > 0 && delayMs < currentDelayMs)
    .sort((left, right) => left - right);
}

async function fails(
  schedule: Schedule,
  target: TargetConfig,
  runSchedule: RunSchedule
): Promise<boolean> {
  return (await runSchedule(target, schedule)).status === "fail";
}
