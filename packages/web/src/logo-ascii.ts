export function canShowAsciiLogo(scrollY: number): boolean {
  return scrollY <= 0;
}

export function shouldShowAsciiBackdrop(screen: string, showScrollCue: boolean): boolean {
  return screen === "exploring" || screen === "report" || screen === "detail" || (screen === "landing" && !showScrollCue);
}

export const ASCII_STROKE_WIDTH = 0.9;

export function shouldClearAsciiReveal(lastMovementAt: number, now: number, idleMs = 100, fadeMs = 180): boolean {
  return now - lastMovementAt >= idleMs + fadeMs;
}

export function getShrinkingRevealRadius(radius: number, elapsedMs: number, durationMs: number): number {
  return Math.max(0, radius * (1 - elapsedMs / durationMs));
}

export function isOutlinePixel(red: number, green: number, blue: number, alpha: number): boolean {
  return alpha > 80 && red > 45 && red < 210 && blue > 35 && blue < 135 && red > green * 3;
}

export type OutlineSegment = { orientation: "horizontal" | "vertical"; start: number; end: number; axis: number };
export type OutlineStroke = OutlineSegment & { thickness: number };

export function findStraightOutlineSegments(pixels: Uint8ClampedArray, width: number, height: number, minimumLength = 4): OutlineSegment[] {
  const selected = (x: number, y: number) => { const index = (y * width + x) * 4; return isOutlinePixel(pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]); };
  const segments: OutlineSegment[] = [];
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      if (x < width && selected(x, y)) { if (start < 0) start = x; }
      else if (start >= 0) { if (x - start >= minimumLength) segments.push({ orientation: "horizontal", start, end: x - 1, axis: y }); start = -1; }
    }
  }
  for (let x = 0; x < width; x++) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      if (y < height && selected(x, y)) { if (start < 0) start = y; }
      else if (start >= 0) { if (y - start >= minimumLength) segments.push({ orientation: "vertical", start, end: y - 1, axis: x }); start = -1; }
    }
  }
  return segments;
}

export function mergeParallelOutlineSegments(segments: OutlineSegment[]): OutlineStroke[] {
  const sorted = [...segments].sort((a, b) => a.orientation.localeCompare(b.orientation) || a.axis - b.axis);
  const groups: Array<{ orientation: "horizontal" | "vertical"; firstAxis: number; lastAxis: number; starts: number[]; ends: number[] }> = [];
  for (const segment of sorted) {
    const group = groups.at(-1);
    if (group && group.orientation === segment.orientation && segment.axis <= group.lastAxis + 1 && Math.abs(segment.start - group.starts.at(-1)!) <= 2 && Math.abs(segment.end - group.ends.at(-1)!) <= 2) {
      group.lastAxis = segment.axis; group.starts.push(segment.start); group.ends.push(segment.end);
    } else groups.push({ orientation: segment.orientation, firstAxis: segment.axis, lastAxis: segment.axis, starts: [segment.start], ends: [segment.end] });
  }
  return groups.map((group) => ({ orientation: group.orientation, start: Math.round(group.starts.reduce((sum, value) => sum + value, 0) / group.starts.length), end: Math.round(group.ends.reduce((sum, value) => sum + value, 0) / group.ends.length), axis: group.firstAxis, thickness: group.lastAxis - group.firstAxis + 1 }));
}

export type LogoGlyph = { x: number; y: number; character: string; color?: string };
export type VelocityRevealShape = { directionX: number; directionY: number; stretch: number };
export type AsciiBackdropPalette = { color: string; baseAlpha: number; trailAlpha: number };
const LOGO_MAGENTA = "#ec0372";

export function getAsciiAccentColor(_theme: "dark" | "light"): string {
  return LOGO_MAGENTA;
}

export function getAsciiGlyphColor(pixels: Uint8ClampedArray, width: number, centerX: number, centerY: number, radius: number): string {
  const height = pixels.length / 4 / width;
  let red = 0; let green = 0; let blue = 0; let count = 0;
  for (let y = Math.max(0, Math.floor(centerY - radius)); y <= Math.min(height - 1, Math.ceil(centerY + radius)); y++) {
    for (let x = Math.max(0, Math.floor(centerX - radius)); x <= Math.min(width - 1, Math.ceil(centerX + radius)); x++) {
      const index = (y * width + x) * 4;
      if (pixels[index + 3] <= 80) continue;
      red += pixels[index]; green += pixels[index + 1]; blue += pixels[index + 2]; count++;
    }
  }
  return count > 0 ? `rgb(${Math.round(red / count)} ${Math.round(green / count)} ${Math.round(blue / count)})` : LOGO_MAGENTA;
}

export function getAsciiBackdropPalette(theme: "dark" | "light"): AsciiBackdropPalette {
  return theme === "light"
    ? { color: getAsciiAccentColor(theme), baseAlpha: 0.025, trailAlpha: 0.07 }
    : { color: getAsciiAccentColor(theme), baseAlpha: 0.02, trailAlpha: 0.075 };
}

export function createBackdropGlyphs(width: number, height: number, step: number): LogoGlyph[] {
  const characters = "@#8B%&WmZO0$+=:-";
  const glyphs: LogoGlyph[] = [];
  for (let y = step / 2; y < height; y += step) {
    for (let x = step / 2; x < width; x += step) {
      glyphs.push({ x, y, character: characters[(x * 3 + y * 5) % characters.length] });
    }
  }
  return glyphs;
}

export function getActiveTrailSamples<T extends { createdAt: number }>(samples: T[], now: number, durationMs: number): T[] {
  return samples.filter((sample) => now - sample.createdAt < durationMs);
}

export function hasOpaquePixelInCell(pixels: Uint8ClampedArray, width: number, startX: number, startY: number, size: number): boolean {
  for (let y = Math.floor(startY); y < Math.min(width, Math.ceil(startY + size)); y++) for (let x = Math.floor(startX); x < Math.min(width, Math.ceil(startX + size)); x++) {
    if (pixels[(y * width + x) * 4 + 3] > 48) return true;
  }
  return false;
}

export function getIrregularRevealRadius(glyph: LogoGlyph, radius: number): number {
  return radius + ((glyph.x * 17 + glyph.y * 31) % 11 - 5);
}

export function getVelocityRevealShape(delta: { x: number; y: number }, elapsedMs: number): VelocityRevealShape {
  const distance = Math.hypot(delta.x, delta.y);
  if (distance === 0) return { directionX: 0, directionY: 0, stretch: 1 };
  const stretch = Math.min(2.4, 1 + distance / Math.max(1, elapsedMs) * 0.5);
  return { directionX: delta.x / distance, directionY: delta.y / distance, stretch: Math.round(stretch * 10) / 10 };
}

export function getRevealedGlyphs(glyphs: LogoGlyph[], pointer: { x: number; y: number }, radius: number, shape: VelocityRevealShape = { directionX: 0, directionY: 0, stretch: 1 }): LogoGlyph[] {
  return glyphs.filter((glyph) => {
    const cellRadius = getIrregularRevealRadius(glyph, radius);
    const x = glyph.x - pointer.x; const y = glyph.y - pointer.y;
    if (shape.directionX === 0 && shape.directionY === 0) return x ** 2 + y ** 2 <= cellRadius ** 2;
    const parallel = x * shape.directionX + y * shape.directionY;
    const perpendicular = x * -shape.directionY + y * shape.directionX;
    return parallel ** 2 / (cellRadius * shape.stretch) ** 2 + perpendicular ** 2 / cellRadius ** 2 <= 1;
  });
}
