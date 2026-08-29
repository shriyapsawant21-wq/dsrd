export interface Delay {
  wait(delayMs: number): Promise<void>;
}

export function validateDelayMs(delayMs: number, field: string): void {
  if (!Number.isFinite(delayMs) || !Number.isInteger(delayMs) || delayMs < 0) {
    throw new RangeError(`${field} must be a non-negative finite integer`);
  }
}

export class SystemDelay implements Delay {
  async wait(delayMs: number): Promise<void> {
    validateDelayMs(delayMs, "delayMs");
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }
}

