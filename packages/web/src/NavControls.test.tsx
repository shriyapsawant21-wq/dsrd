import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NavControls } from "./NavControls";

describe("navigation controls", () => {
  it("renders only the functional theme control", () => {
    const html = renderToStaticMarkup(<NavControls theme="dark" onToggle={() => undefined}/>);

    expect(html.match(/<button/g) ?? []).toHaveLength(1);
    expect(html.match(/<svg/g) ?? []).toHaveLength(1);
    expect(html).toContain("Switch to light mode");
  });
});
