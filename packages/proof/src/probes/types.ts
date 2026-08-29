export type ReadinessObservation = {
  service: string;
  kind: "http" | "tcp";
  status: "ready" | "timeout" | "unhealthy";
  observedAtMs: number;
  detail?: string;
};

export type Clock = () => number;
export type Sleep = (milliseconds: number) => Promise<void>;
