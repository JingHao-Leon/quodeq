import { packSiblings, packEnclose } from 'd3-hierarchy';

const FILL = 0.92;   // files use 92 % of the bubble, leaving a thin rim

/**
 * The files of one area packed inside a unit circle, sized by checks run.
 * @param {{checks: number}[]} dots
 * @returns {{x: number, y: number, r: number}[]} same order
 */
export function packAreaFiles(dots) {
  if (!dots.length) return [];
  const circles = dots.map((d) => ({ r: Math.sqrt(Math.max(1, d.checks)) }));
  packSiblings(circles);
  const hull = packEnclose(circles);
  const k = FILL / hull.r;
  return circles.map((c) => ({ x: (c.x - hull.x) * k, y: (c.y - hull.y) * k, r: c.r * k }));
}
