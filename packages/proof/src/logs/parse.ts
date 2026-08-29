import type { TimelineEvent } from "@dsrd/contracts";

import type {
  LogFailureCategory,
  LogFailureEvidence,
  ParsedLogEvidence,
} from "./types.js";

type StructuredFixtureLog = {
  service?: unknown;
  event?: unknown;
  message?: unknown;
  detail?: unknown;
  timeMs?: unknown;
};

function splitComposeLine(line: string): { container: string; body: string } {
  const separator = line.indexOf("|");
  if (separator < 0) return { container: "unknown", body: line.trim() };

  const containerName = line.slice(0, separator).trim();
  return {
    container: containerName.replace(/[-_]\d+$/, ""),
    body: line.slice(separator + 1).trim(),
  };
}

function resolveService(
  container: string,
  structured: StructuredFixtureLog | undefined,
  knownServices: readonly string[],
): string {
  if (typeof structured?.service === "string") return structured.service;
  return (
    [...knownServices]
      .sort((left, right) => right.length - left.length)
      .find(
        (service) =>
          container === service ||
          container.endsWith(`-${service}`) ||
          container.endsWith(`_${service}`),
      ) ?? container
  );
}

function parseStructured(body: string): StructuredFixtureLog | undefined {
  if (!body.startsWith("{")) return undefined;
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === "object" && value !== null
      ? (value as StructuredFixtureLog)
      : undefined;
  } catch {
    return undefined;
  }
}

function classify(text: string): LogFailureCategory | undefined {
  if (/econnrefused|connection refused/i.test(text)) return "connection_refused";
  if (/etimedout|timed out|timeout/i.test(text)) return "timeout";
  if (/dependency(?: is)? not ready|startup failed/i.test(text)) {
    return "dependency_not_ready";
  }
  return undefined;
}

function summary(category: LogFailureCategory, event?: string): string {
  if (event === "db_connection_failed" && category === "connection_refused") {
    return "PostgreSQL connection was refused";
  }
  if (category === "connection_refused") return "Dependency connection was refused";
  if (category === "timeout") return "Dependency connection timed out";
  return "Dependency was not ready";
}

export function parseLogEvidence(
  lines: string[],
  observedAtMs: number,
  knownServices: readonly string[] = [],
): ParsedLogEvidence {
  const events: TimelineEvent[] = [];
  const failures: LogFailureEvidence[] = [];

  for (const [lineIndex, raw] of lines.entries()) {
    const { container, body } = splitComposeLine(raw);
    const structured = parseStructured(body);
    const service = resolveService(container, structured, knownServices);
    const event =
      typeof structured?.event === "string" ? structured.event : undefined;
    const detail =
      typeof structured?.message === "string"
        ? structured.message
        : typeof structured?.detail === "string"
          ? structured.detail
          : undefined;
    const category = classify(`${event ?? ""} ${detail ?? body}`);
    if (category !== undefined) {
      failures.push({
        service,
        category,
        summary: summary(category, event),
        raw,
      });
    }
    if (event !== undefined || category !== undefined) {
      events.push({
        timeMs:
          typeof structured?.timeMs === "number"
            ? Math.max(0, structured.timeMs)
            : Math.max(0, observedAtMs + lineIndex),
        service,
        event: event ?? `log_${category}`,
        ...(detail === undefined ? {} : { detail }),
      });
    }
  }

  return { events, failures };
}
