export type ReadinessObservation = {
  workload: string;
  kind: "http" | "tcp" | "process" | "custom";
  status: "ready" | "timeout" | "unhealthy";
  observedAtMs: number;
  detail?: string;
};

export type Clock = () => number;
export type Sleep = (milliseconds: number) => Promise<void>;
