import { describe, expect, it, vi } from "vitest";

import { SystemDelay, validateDelayMs } from "../src/index.js";

describe("schedule delay", () => {
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rejects invalid delay %s",
    (delayMs) => {
      expect(() => validateDelayMs(delayMs, "api.startDelayMs")).toThrow(
        "api.startDelayMs must be a non-negative finite integer"
      );
    }
  );

  it("waits for the requested whole number of milliseconds", async () => {
    vi.useFakeTimers();
    const wait = new SystemDelay().wait(250);

    await vi.advanceTimersByTimeAsync(249);
    let settled = false;
    void wait.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(wait).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

