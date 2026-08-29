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
});
