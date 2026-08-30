import { useCallback, useEffect, useRef } from "react";
import {
  createBackdropGlyphs,
  getActiveTrailSamples,
  getAsciiBackdropPalette,
  getRevealedGlyphs,
  getShrinkingRevealRadius,
  getVelocityRevealShape,
  type LogoGlyph,
  type VelocityRevealShape,
} from "./logo-ascii";
import type { Theme } from "./theme";

const glyphStep = 25;
const revealRadius = 90;
const trailDurationMs = 650;
const fontStack = '"JetBrains Mono", "Fira Code", "Terminus", monospace';

type TrailSample = {
  x: number;
  y: number;
  shape: VelocityRevealShape;
  createdAt: number;
};

export function AsciiBackdrop({ theme }: { theme: Theme }) {
  const baseCanvas = useRef<HTMLCanvasElement>(null);
  const trailCanvas = useRef<HTMLCanvasElement>(null);
  const field = useRef<LogoGlyph[]>([]);
  const trail = useRef<TrailSample[]>([]);
  const lastPointer = useRef<{ x: number; y: number; time: number } | null>(null);
  const smoothedDelta = useRef({ x: 0, y: 0 });
  const animationFrame = useRef<number | null>(null);

  const prepareCanvas = useCallback((canvas: HTMLCanvasElement) => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    const context = canvas.getContext("2d");
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    return context;
  }, []);

  const drawBase = useCallback(() => {
    const canvas = baseCanvas.current;
    if (!canvas) return;
    const context = prepareCanvas(canvas);
    if (!context) return;
    const palette = getAsciiBackdropPalette(theme);
    field.current = createBackdropGlyphs(window.innerWidth, window.innerHeight, glyphStep);
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    context.font = `500 14px ${fontStack}`;
    context.textBaseline = "middle";
    context.fillStyle = palette.color;
    context.globalAlpha = palette.baseAlpha;
    for (const glyph of field.current) context.fillText(glyph.character, glyph.x - glyphStep / 4, glyph.y);
    context.globalAlpha = 1;
  }, [prepareCanvas, theme]);

  const renderTrail = useCallback((now: number) => {
    const context = trailCanvas.current?.getContext("2d");
    if (!context) return;
    const active = getActiveTrailSamples(trail.current, now, trailDurationMs);
    trail.current = active;
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const palette = getAsciiBackdropPalette(theme);
    context.font = `600 15px ${fontStack}`;
    context.textBaseline = "middle";
    context.fillStyle = palette.color;
    context.globalAlpha = palette.trailAlpha;
    for (const sample of active) {
      const radius = getShrinkingRevealRadius(revealRadius, now - sample.createdAt, trailDurationMs);
      for (const glyph of getRevealedGlyphs(field.current, sample, radius, sample.shape)) {
        context.fillText(glyph.character, glyph.x - glyphStep / 4, glyph.y);
      }
    }
    context.globalAlpha = 1;
    animationFrame.current = active.length > 0 ? requestAnimationFrame(renderTrail) : null;
  }, [theme]);

  const startRendering = useCallback(() => {
    if (animationFrame.current === null) animationFrame.current = requestAnimationFrame(renderTrail);
  }, [renderTrail]);

  useEffect(() => {
    const resize = () => {
      drawBase();
      if (trailCanvas.current) prepareCanvas(trailCanvas.current);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [drawBase, prepareCanvas]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      const time = performance.now();
      const pointer = { x: event.clientX, y: event.clientY };
      const previous = lastPointer.current;
      const delta = previous ? { x: pointer.x - previous.x, y: pointer.y - previous.y } : { x: 0, y: 0 };
      smoothedDelta.current = {
        x: smoothedDelta.current.x * 0.65 + delta.x * 0.35,
        y: smoothedDelta.current.y * 0.65 + delta.y * 0.35,
      };
      const shape = getVelocityRevealShape(smoothedDelta.current, previous ? time - previous.time : 1);
      lastPointer.current = { ...pointer, time };
      trail.current.push({ ...pointer, shape, createdAt: time });
      if (trail.current.length > 70) trail.current.shift();
      startRendering();
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, [startRendering]);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);

  return <div className="ascii-backdrop" aria-hidden="true">
    <canvas ref={baseCanvas}/>
    <canvas ref={trailCanvas}/>
  </div>;
}
