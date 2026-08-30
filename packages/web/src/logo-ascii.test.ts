import { describe, expect, it } from "vitest";
import { ASCII_STROKE_WIDTH, canShowAsciiLogo, createBackdropGlyphs, findStraightOutlineSegments, getActiveTrailSamples, getAsciiAccentColor, getAsciiBackdropPalette, getAsciiGlyphColor, getIrregularRevealRadius, getRevealedGlyphs, getShrinkingRevealRadius, getVelocityRevealShape, hasOpaquePixelInCell, isOutlinePixel, mergeParallelOutlineSegments, shouldClearAsciiReveal, shouldShowAsciiBackdrop } from "./logo-ascii";

describe("ASCII logo state", () => {
  it("shows the ambient backdrop only on active upload and run result screens", () => {
    expect(shouldShowAsciiBackdrop?.("landing", true)).toBe(false);
    expect(shouldShowAsciiBackdrop?.("landing", false)).toBe(true);
    expect(shouldShowAsciiBackdrop?.("exploring", true)).toBe(true);
    expect(shouldShowAsciiBackdrop?.("report", true)).toBe(true);
    expect(shouldShowAsciiBackdrop?.("detail", true)).toBe(true);
    expect(shouldShowAsciiBackdrop?.("no_failure", false)).toBe(false);
  });

  it("allows the hover artwork only while the landing logo is at rest", () => {
    expect(canShowAsciiLogo(0)).toBe(true);
    expect(canShowAsciiLogo(1)).toBe(false);
  });

  it("reveals only glyph cells that fall within the mouse radius", () => {
    const glyphs = [{ x: 10, y: 10, character: "#" }, { x: 20, y: 10, character: "@" }, { x: 40, y: 10, character: "+" }];
    expect(getRevealedGlyphs(glyphs, { x: 10, y: 10 }, 20)).toEqual([{ x: 10, y: 10, character: "#" }, { x: 20, y: 10, character: "@" }]);
  });

  it("uses a stable cell-specific radius for a jagged edge", () => {
    expect(getIrregularRevealRadius({ x: 10, y: 10, character: "#" }, 20)).toBe(22);
    expect(getIrregularRevealRadius({ x: 31, y: 10, character: "#" }, 20)).toBe(16);
  });

  it("stretches the reveal in the direction of fast cursor movement", () => {
    expect(getVelocityRevealShape({ x: 60, y: 0 }, 20)).toEqual({ directionX: 1, directionY: 0, stretch: 2.4 });
    expect(getVelocityRevealShape({ x: 0, y: 0 }, 20)).toEqual({ directionX: 0, directionY: 0, stretch: 1 });
  });

  it("keeps a glyph cell when any pixel in it belongs to the logo", () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    pixels[(1 * 4 + 1) * 4 + 3] = 255;
    expect(hasOpaquePixelInCell(pixels, 4, 0, 0, 2)).toBe(true);
    expect(hasOpaquePixelInCell(pixels, 4, 2, 2, 2)).toBe(false);
  });

  it("clears the ASCII layer after the cursor has been idle", () => {
    expect(shouldClearAsciiReveal(100, 379)).toBe(false);
    expect(shouldClearAsciiReveal(100, 380)).toBe(true);
  });

  it("shrinks the final reveal radius instead of fading it", () => {
    expect(getShrinkingRevealRadius(30, 0, 180)).toBe(30);
    expect(getShrinkingRevealRadius(30, 90, 180)).toBe(15);
    expect(getShrinkingRevealRadius(30, 180, 180)).toBe(0);
  });

  it("selects dark magenta line pixels without selecting the bright logo blocks", () => {
    expect(isOutlinePixel(120, 18, 82, 255)).toBe(true);
    expect(isOutlinePixel(255, 21, 147, 255)).toBe(false);
  });

  it("turns outline pixels into straight horizontal and vertical segments", () => {
    const pixels = new Uint8ClampedArray(6 * 6 * 4);
    const mark = (x: number, y: number) => { const index = (y * 6 + x) * 4; pixels[index] = 120; pixels[index + 1] = 18; pixels[index + 2] = 82; pixels[index + 3] = 255; };
    for (let x = 1; x <= 4; x++) mark(x, 1);
    for (let y = 2; y <= 5; y++) mark(5, y);
    expect(findStraightOutlineSegments(pixels, 6, 6, 4)).toEqual([
      { orientation: "horizontal", start: 1, end: 4, axis: 1 },
      { orientation: "vertical", start: 2, end: 5, axis: 5 }
    ]);
  });

  it("merges adjacent noisy runs into one uniform-width stroke", () => {
    expect(mergeParallelOutlineSegments([
      { orientation: "horizontal", start: 10, end: 30, axis: 4 },
      { orientation: "horizontal", start: 11, end: 31, axis: 5 }
    ])).toEqual([{ orientation: "horizontal", start: 11, end: 31, axis: 4, thickness: 2 }]);
  });

  it("keeps recent cursor samples as a trail and expires old samples", () => {
    const samples = [{ createdAt: 100 }, { createdAt: 500 }, { createdAt: 800 }];
    expect(getActiveTrailSamples(samples, 900, 600)).toEqual([{ createdAt: 500 }, { createdAt: 800 }]);
  });

  it("uses a subtly lighter ASCII outline", () => {
    expect(ASCII_STROKE_WIDTH).toBe(0.9);
  });

  it("keeps the ambient ASCII field below the low-opacity budget in both themes", () => {
    for (const theme of ["dark", "light"] as const) {
      const palette = getAsciiBackdropPalette?.(theme);
      expect(palette?.color).toBe("#ec0372");
      expect(palette?.baseAlpha).toBeLessThanOrEqual(0.03);
      expect(palette?.trailAlpha).toBeLessThanOrEqual(0.08);
    }
  });

  it("uses the logo magenta for every ASCII theme", () => {
    expect(getAsciiAccentColor?.("dark")).toBe("#ec0372");
    expect(getAsciiAccentColor?.("light")).toBe("#ec0372");
  });

  it("samples each glyph color from its underlying logo pixels", () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    const index = (1 * 4 + 1) * 4;
    pixels.set([236, 3, 114, 255], index);
    expect(getAsciiGlyphColor?.(pixels, 4, 1, 1, 1)).toBe("rgb(236 3 114)");
    expect(getAsciiGlyphColor?.(pixels, 4, 3, 3, 0)).toBe("#ec0372");
  });

  it("fills the viewport with deterministic ASCII cells", () => {
    const field = createBackdropGlyphs?.(50, 50, 25);
    expect(field).toHaveLength(4);
    expect(field?.map(({ x, y }) => [x, y])).toEqual([[12.5, 12.5], [37.5, 12.5], [12.5, 37.5], [37.5, 37.5]]);
  });
});
