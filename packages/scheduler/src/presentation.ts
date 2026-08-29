type ResultSummaryInput = {
  status: "failure" | "no-failure" | "reproduced" | "not-reproduced";
  testedSchedules?: number;
  artifactPath?: string;
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
      return [
        `Failure found after ${input.testedSchedules ?? 0} schedules.`,
        `Saved replay artifact: ${artifactPath}`,
        `Replay (PowerShell): race-debugger replay ${quotePowerShellArgument(artifactPath)}`,
        `Replay (POSIX): race-debugger replay ${quotePosixArgument(artifactPath)}`
      ].join("\n");
    case "no-failure":
      return `No failure found after ${input.testedSchedules ?? 0} schedules.`;
    case "reproduced":
      return "Replay reproduced expected failure.";
    case "not-reproduced":
      return "Replay did not reproduce expected failure.";
  }
}

function quotePowerShellArgument(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quotePosixArgument(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}
