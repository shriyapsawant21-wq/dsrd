import { describe, expect, it } from "vitest";
import { getReportFailures } from "./report-data";

describe("report failure normalization", () => {
  it("uses one consistent demo failure when an incomplete API omits failures", () => {
    const failures = getReportFailures(undefined);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ id: "failure-1", name: "DB_CONNECTION_FAILED", severity: "critical" });
  });

  it("preserves failures returned by the API", () => {
    const actual = [{ id: "real-1", name: "WORKLOAD_EXITED", severity: "critical", reason: "exit code 1" }];
    expect(getReportFailures(actual)).toEqual(actual);
  });
});
