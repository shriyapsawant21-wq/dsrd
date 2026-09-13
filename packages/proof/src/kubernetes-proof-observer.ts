import type { Workload } from "@dsrd/contracts";

import { WorkloadProofObserver, type WorkloadProofObserverOptions } from "./runtime-proof-observer.js";

export type KubernetesObservation = {
  scheduleId: string;
  startedAtMs: number;
  states: Array<{ workload: string; state: "running" | "exited" | "missing"; exitCode?: number; health?: string; observedAtMs: number }>;
  logs: string[];
  events: Array<{ workload: string; timeMs: number; event: string; detail?: string }>;
  refresh?: () => Promise<Pick<KubernetesObservation, "states" | "logs">>;
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
    const refresh = snapshot.refresh;
    return this.observer.evaluate({
      scheduleId: snapshot.scheduleId,
      startedAtMs: snapshot.startedAtMs,
      workloads: [...this.workloads()],
      states: snapshot.states,
      readiness: [],
      workloadEvents: snapshot.events,
      logs: snapshot.logs,
      ...(refresh === undefined ? {} : {
        refresh: async () => ({
          ...(await refresh()),
          readiness: [],
        }),
      }),
    });
  }
}
