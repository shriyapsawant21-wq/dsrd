export type ServiceSchedule = {
  startDelayMs?: number;
  readinessDelayMs?: number;
};

export type Schedule = {
  id: string;
  services: Record<string, ServiceSchedule>;
};

export type TimelineEvent = {
  timeMs: number;
  service: string;
  event: string;
  detail?: string;
};

export type RunResult = {
  scheduleId: string;
  status: "pass" | "fail";
  events: TimelineEvent[];
  logs: string[];
  failureReason?: string;
};

export type FailureArtifact = {
  version: 1;
  createdAt: string;
  originalSchedule: Schedule;
  minimizedSchedule: Schedule;
  expectedFailureReason?: string;
  events: TimelineEvent[];
};
