import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TableHeaderRow } from "./TableHeaderRow";

describe("table header row", () => {
  it("renders a permanent solid logo-pink header with accessible columns", () => {
    const html = renderToStaticMarkup(<TableHeaderRow columns={["FAILURE_NAME", "SEVERITY"]}/>);

    expect(html).toContain("background-color:#ff1593");
    expect(html).toContain("color:#030303");
    expect(html.match(/role="columnheader"/g) ?? []).toHaveLength(2);
  });
});
