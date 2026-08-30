export type LogoMotion = {
  left: number;
  top: number;
  width: number;
  translateXPercent: number;
};

export function getLogoMotion(scrollY: number, viewportWidth: number, viewportHeight: number): LogoMotion {
  const travel = Math.max(240, viewportHeight * 0.4);
  const progress = Math.min(1, Math.max(0, scrollY / travel));
  const startWidth = Math.min(viewportWidth * 0.72, 780);
  const interpolate = (start: number, end: number) => start + (end - start) * progress;
  return {
    left: interpolate(viewportWidth / 2, viewportWidth * 0.055),
    top: interpolate(viewportHeight / 2, 32),
    width: interpolate(startWidth, 150),
    translateXPercent: interpolate(-50, 0)
  };
}
