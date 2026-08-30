import type { RunPhase } from "./contracts.js";
import type { FailureArtifact } from "@dsrd/contracts";
import { RunStore } from "./run-store.js";

export type DiscoveryRunner = (composeFile: string, onProgress: (testedSchedules: number, totalSchedules: number) => void) => Promise<
  | { status: "completed"; artifact?: FailureArtifact; testedSchedules?: number }
  | { status: "no_failure"; testedSchedules?: number }
>;
export class RunService {
  constructor(private readonly store: RunStore, private readonly discover: DiscoveryRunner) {}
  async start(runId: string, composeFile: string): Promise<void> {
    this.store.publish(runId, { ...this.require(runId).progress, phase: "exploring", percentage: 10, message: "Exploring schedules" });
    try {
      const result = await this.discover(composeFile, (testedSchedules, totalSchedules) => {
        const percentage = Math.min(90, 10 + Math.round((testedSchedules / Math.max(1, totalSchedules)) * 80));
        this.store.publish(runId, { ...this.require(runId).progress, phase: "exploring", percentage, message: "SCANNING_SCHEDULES", testedSchedules });
      });
      if (result.status === "completed" && result.artifact) this.store.setArtifact(runId, result.artifact);
      this.store.publish(runId, { ...this.require(runId).progress, testedSchedules: result.testedSchedules ?? 0 });
      this.publishTerminal(runId, result.status, result.status === "completed" ? "Failure report ready" : "No race discovered");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Run failed";
      this.store.setError(runId, message);
      this.publishTerminal(runId, "error", message);
    }
  }
  private publishTerminal(runId: string, phase: RunPhase, message: string): void {
    this.store.publish(runId, { ...this.require(runId).progress, phase, percentage: 100, message });
  }
  private require(runId: string) { const run = this.store.get(runId); if (!run) throw new Error(`Unknown run: ${runId}`); return run; }
}
