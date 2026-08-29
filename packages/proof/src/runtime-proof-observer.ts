import type {
  ComposeServiceState,
  ObservationSnapshot as RuntimeSnapshot,
  RunObserver,
} from "@dsrd/runtime";

import { parseLogEvidence } from "./logs/parse.js";
import { evaluateRun } from "./oracle/evaluate.js";
import type { ContainerObservation } from "./oracle/types.js";
import {
  probeHttpReadiness,
  type HttpProbeOptions,
} from "./probes/http.js";
import {
  probeTcpReadiness,
  type TcpProbeOptions,
} from "./probes/tcp.js";
import type { ReadinessObservation } from "./probes/types.js";

type HttpProbe = (options: HttpProbeOptions) => Promise<ReadinessObservation>;
type TcpProbe = (options: TcpProbeOptions) => Promise<ReadinessObservation>;

export type RuntimeProofObserverOptions = {
  apiUrl: string;
  postgresHost: string;
  postgresPort: number;
  timeoutMs: number;
  pollIntervalMs: number;
  now?: () => number;
  httpProbe?: HttpProbe;
  tcpProbe?: TcpProbe;
};

function normalizeState(
  service: ComposeServiceState,
  observedAtMs: number,
): ContainerObservation {
  const state = service.state.toLowerCase();
  const normalizedState = state.includes("running")
    ? "running"
    : state.includes("exit") || state.includes("dead")
      ? "exited"
      : "missing";

  return {
    service: service.service,
    state: normalizedState,
    ...(service.exitCode === undefined ? {} : { exitCode: service.exitCode }),
    ...(service.health === undefined ? {} : { health: service.health }),
    observedAtMs,
  };
}

export class RuntimeProofObserver implements RunObserver {
  constructor(private readonly options: RuntimeProofObserverOptions) {}

  async evaluate(snapshot: RuntimeSnapshot) {
    const now = this.options.now ?? Date.now;
    const startedAtMs = now();
    const commonProbeOptions = {
      timeoutMs: this.options.timeoutMs,
      pollIntervalMs: this.options.pollIntervalMs,
      now,
    };
    const [apiReadiness, postgresReadiness] = await Promise.all([
      (this.options.httpProbe ?? probeHttpReadiness)({
        ...commonProbeOptions,
        service: "api",
        url: this.options.apiUrl,
      }),
      (this.options.tcpProbe ?? probeTcpReadiness)({
        ...commonProbeOptions,
        service: "postgres",
        host: this.options.postgresHost,
        port: this.options.postgresPort,
      }),
    ]);
    const evidence = (await snapshot.refresh?.()) ?? snapshot;
    const observedAtMs = now();
    const parsedLogs = parseLogEvidence(
      evidence.logs,
      observedAtMs - startedAtMs,
      evidence.services.map(({ service }) => service),
    );

    return evaluateRun({
      scheduleId: snapshot.scheduleId,
      startedAtMs,
      containers: evidence.services.map((service) =>
        normalizeState(service, observedAtMs),
      ),
      readiness: [apiReadiness, postgresReadiness],
      fixtureEvents: parsedLogs.events,
      logFailures: parsedLogs.failures,
      logs: evidence.logs,
    });
  }
}
