import type { RunResult, TimelineEvent } from "@dsrd/contracts";

export type ComposeServiceState = {
  service: string;
  state: string;
  exitCode?: number;
  health?: string;
};

export type ObservationSnapshot = {
  scheduleId: string;
  startedAtMs: number;
  logs: string[];
  services: ComposeServiceState[];
  events: TimelineEvent[];
  signal?: AbortSignal;
  refresh?: () => Promise<{
    logs: string[];
    services: ComposeServiceState[];
  }>;
};

export interface RunObserver {
  evaluate(snapshot: ObservationSnapshot): Promise<RunResult>;
}
