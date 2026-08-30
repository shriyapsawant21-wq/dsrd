import type { Workload } from "@dsrd/contracts";

import { WorkloadProofObserver, type WorkloadProofObserverOptions } from "./runtime-proof-observer.js";
import type { WorkloadEvent, WorkloadStateObservation } from "./oracle/types.js";

export type KubernetesObservation = {
  scheduleId: string;
  startedAtMs: number;
  states: WorkloadStateObservation[];
  logs: string[];
  events: WorkloadEvent[];
};

export class KubernetesProofObserver {
  private readonly observer: WorkloadProofObserver;

  constructor(
    private readonly workloads: () => readonly Workload[],
    options: WorkloadProofObserverOptions = {},
  ) {
    this.observer = new WorkloadProofObserver(options);
  }

  evaluate(snapshot: KubernetesObservation) {
    return this.observer.evaluate({
      scheduleId: snapshot.scheduleId,
      startedAtMs: snapshot.startedAtMs,
      workloads: [...this.workloads()],
      states: snapshot.states,
      readiness: [],
      workloadEvents: snapshot.events,
      logs: snapshot.logs,
    });
  }
}
