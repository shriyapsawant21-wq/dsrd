import { forwardRef, useCallback, useEffect, useRef } from "react";
import {
  ASCII_STROKE_WIDTH,
  getActiveTrailSamples,
  getRevealedGlyphs,
  getShrinkingRevealRadius,
  getVelocityRevealShape,
  hasOpaquePixelInCell,
  type LogoGlyph,
  type VelocityRevealShape,
} from "./logo-ascii";
import type { Theme } from "./theme";

const canvasSize = 1000;
const glyphStep = 16;
const revealRadius = 64;
const trailDurationMs = 600;
const glyphs = "@#8B%&WmZO0$+=:-";

type TrailSample = {
  x: number;
  y: number;
  shape: VelocityRevealShape;
  createdAt: number;
};

export const AsciiLogo = forwardRef<HTMLDivElement, { enabled: boolean; theme: Theme }>(function AsciiLogo(
  { enabled, theme },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const logoGlyphs = useRef<LogoGlyph[]>([]);
  const trail = useRef<TrailSample[]>([]);
  const lastPointer = useRef<{ x: number; y: number; time: number } | null>(null);
  const smoothedDelta = useRef({ x: 0, y: 0 });
  const animationFrame = useRef<number | null>(null);

  const renderTrail = useCallback(
    (now: number) => {
      const context = canvas.current?.getContext("2d");
      if (!context) return;

      const active = getActiveTrailSamples(trail.current, now, trailDurationMs);
      trail.current = active;
      context.clearRect(0, 0, canvasSize, canvasSize);
      context.font = `900 ${glyphStep + 2}px "JetBrains Mono", "Fira Code", "Terminus", monospace`;
      context.textBaseline = "middle";
      context.lineWidth = ASCII_STROKE_WIDTH;

      const surface = theme === "light" ? "#ffdbea" : "#030303";
      const accent = theme === "light" ? "#d40070" : "#ff1593";
      for (const sample of active) {
        const radius = getShrinkingRevealRadius(revealRadius, now - sample.createdAt, trailDurationMs);
        for (const glyph of getRevealedGlyphs(logoGlyphs.current, sample, radius, sample.shape)) {
          context.fillStyle = surface;
          context.fillRect(glyph.x - glyphStep / 2 - 1, glyph.y - glyphStep / 2 - 1, glyphStep + 2, glyphStep + 2);
          context.fillStyle = accent;
          context.strokeStyle = accent;
          context.strokeText(glyph.character, glyph.x - glyphStep / 2, glyph.y);
          context.fillText(glyph.character, glyph.x - glyphStep / 2, glyph.y);
        }
      }

      animationFrame.current = active.length > 0 ? requestAnimationFrame(renderTrail) : null;
    },
    [theme],
  );

  const startRendering = useCallback(() => {
    if (animationFrame.current === null) animationFrame.current = requestAnimationFrame(renderTrail);
  }, [renderTrail]);

  const clearTrail = useCallback(() => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    trail.current = [];
    lastPointer.current = null;
    smoothedDelta.current = { x: 0, y: 0 };
    canvas.current?.getContext("2d")?.clearRect(0, 0, canvasSize, canvasSize);
  }, []);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const sample = document.createElement("canvas");
      sample.width = canvasSize;
      sample.height = canvasSize;
      const context = sample.getContext("2d");
      if (!context) return;

      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvasSize, canvasSize);
      const pixels = context.getImageData(0, 0, canvasSize, canvasSize).data;
      const next: LogoGlyph[] = [];
      for (let y = glyphStep / 2; y < canvasSize; y += glyphStep) {
        for (let x = glyphStep / 2; x < canvasSize; x += glyphStep) {
          if (hasOpaquePixelInCell(pixels, canvasSize, x - glyphStep / 2, y - glyphStep / 2, glyphStep)) {
            next.push({ x, y, character: glyphs[(x * 3 + y * 5) % glyphs.length] });
          }
        }
      }
      logoGlyphs.current = next;
    };
    image.src = "/dsrd-logo.png";
    return () => {
      image.onload = null;
    };
  }, []);

  useEffect(() => {
    if (!enabled) clearTrail();
  }, [clearTrail, enabled]);

  useEffect(() => () => clearTrail(), [clearTrail]);

  useEffect(() => {
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = requestAnimationFrame(renderTrail);
    }
  }, [renderTrail]);

  return (
    <div
      ref={ref}
      className="moving-logo"
      aria-label="DSRD"
      onMouseMove={(event) => {
        if (!enabled) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const pointer = {
          x: ((event.clientX - bounds.left) * canvasSize) / bounds.width,
          y: ((event.clientY - bounds.top) * canvasSize) / bounds.height,
        };
        const time = performance.now();
        const previous = lastPointer.current;
        const delta = previous ? { x: pointer.x - previous.x, y: pointer.y - previous.y } : { x: 0, y: 0 };
        smoothedDelta.current = {
          x: smoothedDelta.current.x * 0.65 + delta.x * 0.35,
          y: smoothedDelta.current.y * 0.65 + delta.y * 0.35,
        };
        const shape = getVelocityRevealShape(smoothedDelta.current, previous ? time - previous.time : 1);
        lastPointer.current = { ...pointer, time };
        trail.current.push({ ...pointer, shape, createdAt: time });
        if (trail.current.length > 60) trail.current.shift();
        startRendering();
      }}
    >
      <img className="moving-logo-art" src="/dsrd-logo.png" alt="DSRD" />
      <canvas ref={canvas} className="moving-logo-ascii-canvas" width={canvasSize} height={canvasSize} aria-hidden="true" />
    </div>
  );
});
