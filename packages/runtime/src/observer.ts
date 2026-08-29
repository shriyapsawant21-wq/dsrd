import type { RunResult } from "@dsrd/contracts";

export type ComposeServiceState = {
  service: string;
  state: string;
  exitCode?: number;
  health?: string;
};

export type ObservationSnapshot = {
  scheduleId: string;
  logs: string[];
  services: ComposeServiceState[];
};

export interface RunObserver {
  evaluate(snapshot: ObservationSnapshot): Promise<RunResult>;
}

