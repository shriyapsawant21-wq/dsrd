import type { TimelineEvent } from "@dsrd/contracts";

import type { ReadinessObservation } from "../probes/types.js";

export type ContainerObservation = {
  service: string;
  state: "running" | "exited" | "missing";
  exitCode?: number;
  observedAtMs: number;
};

export type ObservationSnapshot = {
  scheduleId: string;
  startedAtMs: number;
  containers: ContainerObservation[];
  readiness: ReadinessObservation[];
  fixtureEvents: TimelineEvent[];
  logs: string[];
};
