import { describe, expect, it } from "vitest";
import { getLogoMotion } from "./logo-motion";

describe("logo motion", () => {
  it("starts centered and ends docked in the navbar", () => {
    expect(getLogoMotion(0, 1200, 800)).toMatchObject({ left: 600, top: 400, width: 780, translateXPercent: -50 });
    expect(getLogoMotion(320, 1200, 800)).toMatchObject({ left: 66, top: 32, width: 150, translateXPercent: 0 });
    expect(getLogoMotion(800, 1200, 800)).toMatchObject({ left: 66, top: 32, width: 150, translateXPercent: 0 });
  });
});
