import type { Workload } from "@dsrd/contracts";
import type { ObservationSnapshot, RunObserver } from "@dsrd/runtime";

import type { WorkloadEvent, WorkloadStateObservation } from "./oracle/types.js";
import { WorkloadProofObserver, type WorkloadProofObserverOptions } from "./runtime-proof-observer.js";

export class ComposeProofObserver implements RunObserver {
  private readonly proofObserver: WorkloadProofObserver;

  constructor(
    private readonly workloads: () => readonly Workload[],
    options: WorkloadProofObserverOptions = {},
  ) {
    this.proofObserver = new WorkloadProofObserver(options);
  }

  async evaluate(snapshot: ObservationSnapshot) {
    return this.proofObserver.evaluate({
      scheduleId: snapshot.scheduleId,
      startedAtMs: snapshot.startedAtMs,
      workloads: [...this.workloads()],
      states: this.states(snapshot),
      readiness: [],
      workloadEvents: this.events(snapshot),
      logs: snapshot.logs,
      ...(snapshot.signal === undefined ? {} : { signal: snapshot.signal }),
      ...(snapshot.refresh === undefined
        ? {}
        : {
            refresh: async () => {
              const refreshed = await snapshot.refresh?.();
              if (refreshed === undefined) {
                throw new Error("Compose observation refresh was unavailable");
              }
              return {
                states: this.states(refreshed),
                readiness: [],
                logs: refreshed.logs,
              };
            },
          }),
    });
  }

  private states(
    snapshot: Pick<ObservationSnapshot, "services">,
  ): WorkloadStateObservation[] {
    const observedAtMs = Date.now();
    return snapshot.services.map((service) => ({
      workload: service.service,
      state: service.state === "running" || service.state === "exited" ? service.state : "missing",
      ...(service.exitCode === undefined ? {} : { exitCode: service.exitCode }),
      ...(service.health === undefined ? {} : { health: service.health }),
      observedAtMs,
    }));
  }

  private events(snapshot: ObservationSnapshot): WorkloadEvent[] {
    return snapshot.events.map(({ service, ...event }) => ({ workload: service, ...event }));
  }
}
