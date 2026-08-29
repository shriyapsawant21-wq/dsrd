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
  const title = useColor ? `\u001B[96m${banner}\u001B[0m` : banner;

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
      return [
        `Failure found after ${input.testedSchedules ?? 0} schedules.`,
        `Saved replay artifact: ${input.artifactPath ?? "failure.json"}`,
        `Replay: race-debugger replay ${input.artifactPath ?? "failure.json"}`
      ].join("\n");
    case "no-failure":
      return `No failure found after ${input.testedSchedules ?? 0} schedules.`;
    case "reproduced":
      return "Replay reproduced expected failure.";
    case "not-reproduced":
      return "Replay did not reproduce expected failure.";
  }
}
