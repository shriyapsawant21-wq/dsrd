export interface ReadinessDelayAdapter {
  apply(service: string, delayMs: number): Promise<void>;
  clear(): Promise<void>;
}

