import type { FailureArtifact, RunResult } from "@dsrd/contracts";

type ResultSummaryInput = {
  status: "failure" | "no-failure" | "reproduced" | "not-reproduced";
  testedSchedules?: number;
  artifactPath?: string;
  perturbations?: Array<{ workloadId: string; phase: string; delayMs: number }>;
  failureReason?: string;
  events?: Array<{ timeMs: number; service: string; event: string; detail?: string }>;
  useColor?: boolean;
  scope?: { workloads: number; dimensions: number; candidates: number };
  exploredSchedules?: number;
  originalPerturbations?: number;
};

const banner = [
  "██████╗ ███████╗██████╗ ██████╗",
  "██╔══██╗██╔════╝██╔══██╗██╔══██╗",
  "██║  ██║███████╗██████╔╝██║  ██║",
  "██║  ██║╚════██║██╔══██╗██║  ██║",
  "██████╔╝███████║██║  ██║██████╔╝",
  "╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝"
].join("\n");

export function renderDashboard(useColor: boolean): string {
  const title = useColor ? `\u001B[38;2;255;105;180m${banner}\u001B[0m` : banner;

  return [
    title,
    "",
    "Discover, minimize, and replay startup race conditions.",
    "DISCOVER  →  MINIMIZE  →  REPLAY",
    "",
    "[S] Search for a race",
    "[R] Replay an artifact",
    "[Q] Quit"
  ].join("\n");
}

export function renderResultSummary(input: ResultSummaryInput): string {
  switch (input.status) {
    case "failure":
      const artifactPath = input.artifactPath ?? "failure.json";
      const summary = [
        `Failure found after ${input.testedSchedules ?? 0} schedules.`,
        `Saved replay artifact: ${artifactPath}`,
        `Replay (PowerShell): race-debugger replay ${quotePowerShellArgument(artifactPath)}`,
        `Replay (POSIX): race-debugger replay ${quotePosixArgument(artifactPath)}`
      ];
      const perturbations = input.perturbations ?? [];
      summary.push(
        perturbations.length === 0
          ? "Found at perturbation: baseline"
          : `Found at perturbation: ${perturbations.map(formatPerturbation).join(", ")}`
      );
      if (input.failureReason !== undefined) {
        summary.push(`Failure reason: ${input.failureReason}`);
      }
      if ((input.events?.length ?? 0) > 0) {
        summary.push(
          `Failure evidence: ${input.events?.map(formatEvent).join("; ")}`
        );
      }
      if (input.scope !== undefined) {
        summary.push(
          `Search scope: ${input.scope.workloads} workloads, ${input.scope.dimensions} perturbation dimensions, ${input.scope.candidates} candidate schedules.`
        );
      }
      if (input.exploredSchedules !== undefined) {
        summary.push(
          `Scope explored: ${input.exploredSchedules} of ${input.scope?.candidates ?? input.exploredSchedules} candidate schedules (stopped at first failure).`
        );
      }
      if (input.originalPerturbations !== undefined) {
        summary.push(
          `Minimization: ${input.originalPerturbations} perturbation(s) → ${perturbations.length} perturbation(s).`
        );
      }
      return styleFailure(summary.join("\n"), input.useColor === true);
    case "no-failure":
      return `No failure found after ${input.testedSchedules ?? 0} schedules.`;
    case "reproduced":
      return "Replay reproduced expected failure.";
    case "not-reproduced":
      return "Replay did not reproduce expected failure.";
  }
}

export function renderReplaySummary(
  artifact: FailureArtifact,
  result: RunResult,
  status: "reproduced" | "not-reproduced",
  useColor = false,
  evidenceMatched = 0,
): string {
  const targetPath = "composeFile" in artifact.target
    ? artifact.target.composeFile
    : artifact.target.manifestPath;
  const perturbations = artifact.minimizedSchedule.perturbations;
  return styleFailure([
    status === "reproduced"
      ? "Replay reproduced expected failure."
      : "Replay did not reproduce expected failure.",
    `Replay target: ${targetPath}`,
    perturbations.length === 0
      ? "Replay perturbation: baseline"
      : `Replay perturbation: ${perturbations.map(formatPerturbation).join(", ")}`,
    `Expected failure: ${artifact.expectedFailureReason ?? "not recorded"}`,
    `Observed failure: ${result.failureReason ?? "none"}`,
    `Replay execution: ${result.status.toUpperCase()} (schedule ${result.scheduleId}).`,
    `Evidence matched: ${evidenceMatched}/${artifact.events.length} timeline events.`,
    `Replay evidence: ${result.events.length === 0 ? "none" : result.events.map(formatEvent).join("; ")}`,
  ].join("\n"), useColor);
}

function styleFailure(value: string, useColor: boolean): string {
  return useColor ? `\u001B[38;2;255;105;180m${value}\u001B[0m` : value;
}

function formatPerturbation(perturbation: { workloadId: string; phase: string; delayMs: number }): string {
  return `${perturbation.workloadId} ${perturbation.phase} +${perturbation.delayMs}ms`;
}

function formatEvent(event: { timeMs: number; service: string; event: string; detail?: string }): string {
  return `${event.service} ${event.event} at ${event.timeMs}ms${event.detail === undefined ? "" : ` — ${event.detail}`}`;
}

function quotePowerShellArgument(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quotePosixArgument(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}
