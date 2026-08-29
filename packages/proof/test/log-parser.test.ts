import { describe, expect, it } from "vitest";

import { parseLogEvidence } from "../src/logs/parse.js";

describe("parseLogEvidence", () => {
  it("parses a Compose-prefixed structured fixture failure", () => {
    const result = parseLogEvidence(
      ['api-1 | {"event":"db_connection_failed","message":"connect ECONNREFUSED postgres:5432","timeMs":42}'],
      1_000,
    );

    expect(result.failures).toEqual([
      {
        service: "api",
        category: "connection_refused",
        summary: "PostgreSQL connection was refused",
        raw: 'api-1 | {"event":"db_connection_failed","message":"connect ECONNREFUSED postgres:5432","timeMs":42}',
      },
    ]);
    expect(result.events).toEqual([
      {
        timeMs: 42,
        service: "api",
        event: "db_connection_failed",
        detail: "connect ECONNREFUSED postgres:5432",
      },
    ]);
  });

  it.each([
    ["worker-1 | connect ECONNREFUSED api:3000", "connection_refused"],
    ["api-1 | dependency connection timed out", "timeout"],
    ["api-1 | dependency not ready", "dependency_not_ready"],
  ] as const)("classifies %s", (line, category) => {
    const result = parseLogEvidence([line], 250);

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ category });
    expect(result.events[0]?.timeMs).toBe(250);
  });

  it("ignores unrelated logs", () => {
    expect(parseLogEvidence(["postgres-1 | ready for connections"], 0)).toEqual({
      events: [],
      failures: [],
    });
  });

  it("preserves observed order for fixture events without timestamps", () => {
    const result = parseLogEvidence(
      [
        'api-1 | {"event":"db_connection_attempted"}',
        'api-1 | {"event":"db_connection_succeeded"}',
        'api-1 | {"event":"cache_connection_succeeded"}',
      ],
      100,
    );

    expect(result.events.map(({ timeMs, event }) => [timeMs, event])).toEqual([
      [100, "db_connection_attempted"],
      [101, "db_connection_succeeded"],
      [102, "cache_connection_succeeded"],
    ]);
  });

  it("uses structured service identity for a project-prefixed container", () => {
    const result = parseLogEvidence(
      [
        'dsrd-startup-race-api-1 | {"service":"api","event":"db_connection_failed","detail":"connect ECONNREFUSED"}',
      ],
      20,
      ["postgres", "cache", "api", "worker"],
    );

    expect(result.failures[0]?.service).toBe("api");
    expect(result.events[0]?.service).toBe("api");
  });

  it("resolves raw project-prefixed lines against known service names", () => {
    const result = parseLogEvidence(
      ["dsrd-startup-race-worker-1 | connect ECONNREFUSED api:3000"],
      20,
      ["api", "worker"],
    );

    expect(result.failures[0]?.service).toBe("worker");
  });
});
