import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExploringTitle, getExploringDotDelay } from "./ExploringTitle";

describe("exploring title", () => {
  it("renders three dots with left-to-right animation delays", () => {
    const html = renderToStaticMarkup(<ExploringTitle/>);

    expect(html.match(/class="exploring-dot"/g) ?? []).toHaveLength(3);
    expect(getExploringDotDelay(0)).toBe(0);
    expect(getExploringDotDelay(1)).toBe(180);
    expect(getExploringDotDelay(2)).toBe(360);
    expect(html).toContain('aria-hidden="true"');
  });
});
