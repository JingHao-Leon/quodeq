/**
 * The principles radial's shared geometry and wiring: a point on an axis,
 * and the hover and focus handlers a vertex and its label share.
 */

/** The point at `r` along the axis at `angle` (radians, 0 at 3 o'clock). */
export function polar(angle, r) {
  return [r * Math.cos(angle), r * Math.sin(angle)];
}

/** Hover and focus wiring shared by a vertex and its label: tells the page which principle the pointer or keyboard is on. */
export function hoverProps(name, onHover) {
  if (!onHover) return {};
  const on = () => onHover(name);
  const off = () => onHover(null);
  return { onMouseEnter: on, onMouseLeave: off, onFocus: on, onBlur: off };
}
