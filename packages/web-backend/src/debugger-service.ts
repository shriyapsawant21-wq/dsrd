import type {
  ExecutionPlatform,
  FailureArtifact,
  RunResult,
  Schedule,
  TargetConfig
} from "@dsrd/contracts";
import {
  discoverFailure,
  generateCandidates,
  replayFailure,
  type DiscoveryResult,
  type ReplayResult
} from "@dsrd/scheduler";

import type {
  PlatformResolver,
  ProgressListener,
  SearchRequest
} from "./types.js";

export class DebuggerService {
  constructor(private readonly resolvePlatform: PlatformResolver) {}

  async search(
    request: SearchRequest,
    onProgress: ProgressListener,
    signal?: AbortSignal
  ): Promise<DiscoveryResult> {
    const platform = this.resolvePlatform(request.target);
    const workloads = await platform.discover(request.target);
    const candidates = generateCandidates(workloads, request.delayOptionsMs);
    const execute = this.progressRunner(
      platform.run.bind(platform),
      onProgress,
      signal
    );

    return discoverFailure({
      target: request.target,
      candidates,
      delayOptionsMs: request.delayOptionsMs,
      runSchedule: execute
    });
  }

  replay(
    artifact: FailureArtifact,
    onProgress: ProgressListener,
    signal?: AbortSignal
  ): Promise<ReplayResult> {
    const platform = this.resolvePlatform(artifact.target);
    return replayFailure(
      artifact,
      this.progressRunner(platform.replay.bind(platform), onProgress, signal)
    );
  }

  platformFor(target: TargetConfig): ExecutionPlatform {
    return this.resolvePlatform(target);
  }

  private progressRunner(
    run: (
      target: TargetConfig,
      schedule: Schedule
    ) => Promise<RunResult>,
    onProgress: ProgressListener,
    signal?: AbortSignal
  ) {
    let attempt = 0;
    return async (target: TargetConfig, schedule: Schedule): Promise<RunResult> => {
      signal?.throwIfAborted();
      attempt += 1;
      onProgress({ type: "schedule_started", attempt, schedule });
      const result = await run(target, schedule);
      onProgress({
        type: "schedule_completed",
        attempt,
        schedule,
        result
      });
      return result;
    };
  }
}
