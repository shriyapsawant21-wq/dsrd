export interface StartDelayGate {
  wait(service: string, signal: AbortSignal): Promise<void>;
}
