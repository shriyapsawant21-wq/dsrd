import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScrollCue } from "./ScrollCue";

describe("scroll cue", () => {
  it("shows only the down arrow without instructional text", () => {
    const markup = renderToStaticMarkup(<ScrollCue />);
    expect(markup).toContain("↓");
    expect(markup).not.toContain("SCROLL_TO_INITIALIZE");
  });

  it("removes the arrow after the upload screen becomes active", () => {
    expect(renderToStaticMarkup(<ScrollCue visible={false} />)).toBe("");
  });
});
