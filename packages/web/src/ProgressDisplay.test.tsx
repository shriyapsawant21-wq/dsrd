import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressDisplay } from "./ProgressDisplay";

describe("progress display", () => {
  it("renders backend progress as a rectangular bar without a chaos orbit", () => {
    const html = renderToStaticMarkup(<ProgressDisplay progress={{
          runId: "run-1",
          phase: "exploring",
          percentage: 50,
          message: "SCANNING_SCHEDULES",
          testedSchedules: 6,
          failureCount: 0
        }}/>);

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).not.toContain("chaos-progress");
  });
});
