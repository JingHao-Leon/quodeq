/**
 * PrinciplesRadial — SVG radial plot of a dimension's principles.
 *
 * Always renders one axis per principle (so the frame is stable as evidence
 * accumulates over runs). Plots only principles with evidence; insufficient
 * axes get a small dashed marker on the inner ring and a dimmed label.
 *
 * Edge cases:
 *   - 0 plotted: frame only, no polyline, no vertex dots.
 *   - 1 plotted: a single vertex dot, no polyline.
 *   - 2 plotted: an open <polyline fill="none">, two dots, no fill.
 *   - 3+ plotted: a filled <polyline> (with implicit-close fill) connecting
 *     plotted vertices in axis order; insufficient axes produce stroke gaps.
 */
import { polar, hoverProps } from './radialGeometry.js';
import RadialLabels from './RadialLabels.jsx';
import { t } from '../../../strings/index.js';
import { KEY } from '../../../vocab/keyboard.js';
import { SCORE_SCALE_MAX } from '../../../constants.js';
// Ring levels, as a fraction of the outer radius (fifths).
const RING_LEVEL_1 = 0.2;
const RING_LEVEL_2 = 0.4;
const RING_LEVEL_3 = 0.6;
const RING_LEVEL_4 = 0.8;
const RING_LEVEL_5 = 1.0;
const RING_LEVELS = [RING_LEVEL_1, RING_LEVEL_2, RING_LEVEL_3, RING_LEVEL_4, RING_LEVEL_5]; // fraction of max
// Where the insufficient-evidence marker sits, as a fraction of the outer
// radius. Not a ring level: it happens to coincide with the innermost ring
// today, but it marks "no score to plot", not a score of 2/10.
const INSUFFICIENT_DOT_RADIUS_FRACTION = 0.2;
const VERT_RADIUS = 3.2;
const INSUF_RADIUS = 3.0;
// Hollow ring around a scored vertex that rests on thin evidence.
const THIN_HALO_GAP = 3; // svg units between the vertex dot and its ring
const THIN_HALO_RADIUS = VERT_RADIUS + THIN_HALO_GAP;
// Horizontal padding around the plot so long principle names don't clip.
const VIEWBOX_PAD_X = 140;
const VIEWBOX_PAD_Y = 24;
// A polygon needs at least 3 plotted vertices to read as a filled shape
// (see the module doc comment's edge cases).
const MIN_FILLED_POLYGON_POINTS = 3;

function axisAngles(n) {
  // First axis at 12 o'clock, then clockwise.
  return Array.from({ length: n }, (_, i) => -Math.PI / 2 + (2 * Math.PI * i) / n);
}

function ringPoints(angles, r) {
  return angles.map((a) => polar(a, r).join(',')).join(' ');
}

function RadialRings({ angles, outerRadius }) {
  return (
    <g>
      {RING_LEVELS.map((lvl, idx) => (
        <polygon
          key={idx}
          className="qd-radial__ring"
          points={ringPoints(angles, lvl * outerRadius)}
          fill="none"
        />
      ))}
    </g>
  );
}

function RadialAxes({ angles, outerRadius }) {
  return (
    <g>
      {angles.map((a, idx) => {
        const [x, y] = polar(a, outerRadius);
        return <line key={idx} className="qd-radial__axis" x1="0" y1="0" x2={x} y2={y} />;
      })}
    </g>
  );
}

/* Polyline (3+ filled, 2 open, 1 or 0 absent) */
function RadialPolyline({ showPolyline, points, isClosed, polylineFill }) {
  if (!showPolyline) return null;
  return (
    <polyline
      className="qd-radial__poly"
      fill={polylineFill}
      points={(isClosed ? [...points, points[0]] : points)
        .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
        .join(' ')}
    />
  );
}

// A lit vertex (its card or label hovered or focused) grows a little.
const HL_VERT_RADIUS = 5.5;

/* Plotted vertices (a hollow ring around those on thin evidence), plus a small
 * dashed marker near centre for each insufficient-evidence axis. */
function RadialVertices({ points, plotted, principles, angles, outerRadius, onPrincipleClick, handleClick, handleKey, highlighted, onHover }) {
  return (
    <>
      {points.map(([x, y], idx) => {
        const name = plotted[idx].name;
        return (
          <circle
            key={`v-${idx}`}
            className={`qd-radial__vert${name === highlighted ? ' is-hl' : ''}`}
            cx={x}
            cy={y}
            r={name === highlighted ? HL_VERT_RADIUS : VERT_RADIUS}
            {...hoverProps(name, onHover)}
            role={onPrincipleClick ? 'button' : undefined}
            tabIndex={onPrincipleClick ? 0 : undefined}
            aria-label={onPrincipleClick ? t('explorer.drillInto', { name }) : undefined}
            onClick={onPrincipleClick ? handleClick(name) : undefined}
            onKeyDown={onPrincipleClick ? handleKey(name) : undefined}
            style={onPrincipleClick ? { cursor: 'pointer' } : undefined}
          />
        );
      })}
      {points.map(([x, y], idx) => (plotted[idx].thin ? (
        <circle
          key={`thin-${idx}`}
          className="qd-radial__vert--insuf"
          cx={x}
          cy={y}
          r={THIN_HALO_RADIUS}
          fill="none"
          pointerEvents="none"
        />
      ) : null))}
      {principles.map((p, i) => {
        if (p.hasEvidence) return null;
        const [x, y] = polar(angles[i], outerRadius * INSUFFICIENT_DOT_RADIUS_FRACTION);
        return (
          <circle
            key={`insuf-${i}`}
            className="qd-radial__vert--insuf"
            cx={x}
            cy={y}
            r={INSUF_RADIUS}
            fill="none"
          />
        );
      })}
    </>
  );
}

/** Everything derived from the principles list + dimensions: the plotted
 * (evidenced) subset, their world points, polyline fill/closed/visibility,
 * and the SVG viewBox. */
function computeRadialLayout(principles, angles, scaleMax, outerRadius, size) {
  const plotted = principles
    .map((p, i) => ({ ...p, idx: i, angle: angles[i] }))
    .filter((p) => p.hasEvidence && p.score != null && !Number.isNaN(parseFloat(p.score)));

  const points = plotted.map((p) => {
    const r = (Math.max(0, Math.min(p.score, scaleMax)) / scaleMax) * outerRadius;
    return polar(p.angle, r);
  });

  const polylineFill = plotted.length >= MIN_FILLED_POLYGON_POINTS
    ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)'
    : 'none';
  const isClosed = plotted.length >= MIN_FILLED_POLYGON_POINTS && plotted.length === principles.length;
  const showPolyline = plotted.length >= 2;

  const half = size / 2;
  const viewBox = `${-half - VIEWBOX_PAD_X} ${-half - VIEWBOX_PAD_Y} ${size + VIEWBOX_PAD_X * 2} ${size + VIEWBOX_PAD_Y * 2}`;

  return { plotted, points, polylineFill, isClosed, showPolyline, viewBox };
}

/** The highlighted principle's spoke, from the centre to its point. */
function HighlightSpoke({ plotted, points, highlighted }) {
  const idx = plotted.findIndex((p) => p.name === highlighted);
  if (idx < 0) return null;
  const [x, y] = points[idx];
  return <line className="qd-radial__spoke-hl" x1={0} y1={0} x2={x} y2={y} />;
}

function makeRadialHandlers(onPrincipleClick) {
  const handleClick = (name) => () => onPrincipleClick && onPrincipleClick(name);
  const handleKey = (name) => (e) => {
    if ((e.key === KEY.ENTER || e.key === ' ') && onPrincipleClick) {
      e.preventDefault();
      onPrincipleClick(name);
    }
  };
  return { handleClick, handleKey };
}

export default function PrinciplesRadial({
  principles = [],
  scaleMax = SCORE_SCALE_MAX,
  size = 400,
  outerRadius = 200,
  onPrincipleClick,
  highlighted = null,
  onHover,
}) {
  const angles = axisAngles(principles.length);
  const { plotted, points, polylineFill, isClosed, showPolyline, viewBox } =
    computeRadialLayout(principles, angles, scaleMax, outerRadius, size);
  const { handleClick, handleKey } = makeRadialHandlers(onPrincipleClick);

  return (
    <svg
      className="qd-radial__svg"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      role="img"
      aria-label={t('explorer.principlesRadial')}
    >
      <RadialRings angles={angles} outerRadius={outerRadius} />
      <RadialAxes angles={angles} outerRadius={outerRadius} />
      <RadialPolyline showPolyline={showPolyline} points={points} isClosed={isClosed} polylineFill={polylineFill} />
      <HighlightSpoke plotted={plotted} points={points} highlighted={highlighted} />
      <RadialVertices
        points={points} plotted={plotted} principles={principles} angles={angles} outerRadius={outerRadius}
        onPrincipleClick={onPrincipleClick} handleClick={handleClick} handleKey={handleKey} highlighted={highlighted} onHover={onHover}
      />
      <RadialLabels
        principles={principles} angles={angles} outerRadius={outerRadius}
        onPrincipleClick={onPrincipleClick} handleClick={handleClick} handleKey={handleKey} highlighted={highlighted} onHover={onHover}
      />
    </svg>
  );
}
