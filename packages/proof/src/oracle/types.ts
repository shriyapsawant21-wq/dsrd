import type { TimelineEvent } from "@dsrd/contracts";

import type { ReadinessObservation } from "../probes/types.js";
import type { LogFailureEvidence } from "../logs/types.js";

export type ContainerObservation = {
  service: string;
  state: "running" | "exited" | "missing";
  exitCode?: number;
  health?: string;
  observedAtMs: number;
};

export type ObservationSnapshot = {
  scheduleId: string;
  startedAtMs: number;
  containers: ContainerObservation[];
  readiness: ReadinessObservation[];
  fixtureEvents: TimelineEvent[];
  logFailures: LogFailureEvidence[];
  logs: string[];
};
