import { createConnection } from "node:net";

import type {
  Clock,
  ReadinessObservation,
  Sleep,
} from "./types.js";

export type TcpProbeOptions = {
  workload: string;
  host: string;
  port: number;
  timeoutMs: number;
  pollIntervalMs: number;
  now?: Clock;
  sleep?: Sleep;
};

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function canConnect(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const finish = (connected: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

export async function probeTcpReadiness(
  options: TcpProbeOptions,
): Promise<ReadinessObservation> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = now() + options.timeoutMs;

  while (true) {
    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      return {
        workload: options.workload,
        kind: "tcp",
        status: "timeout",
        observedAtMs: now(),
      };
    }

    if (await canConnect(options.host, options.port, remainingMs)) {
      return {
        workload: options.workload,
        kind: "tcp",
        status: "ready",
        observedAtMs: now(),
      };
    }

    const waitMs = Math.min(options.pollIntervalMs, deadline - now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
}
