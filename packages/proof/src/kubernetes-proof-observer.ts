import type { Workload } from "@dsrd/contracts";

import { WorkloadProofObserver, type WorkloadProofObserverOptions } from "./runtime-proof-observer.js";

export type KubernetesObservation = {
  scheduleId: string;
  startedAtMs: number;
  states: Array<{ workload: string; state: "running" | "exited" | "missing"; exitCode?: number; observedAtMs: number }>;
  logs: string[];
  events: Array<{ workload: string; timeMs: number; event: string; detail?: string }>;
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
