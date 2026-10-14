/**
 * The principles radial's axis labels: each principle's name wrapped over
 * lines with its score under it, on a ring just outside the plot; a label
 * opens its principle and, hovered or focused, lights it.
 */
import { scoreGradeColorVar } from '../../../utils/formatters.js';
import { polar, hoverProps } from './radialGeometry.js';

const LABEL_OFFSET = 18;     // svg units beyond the outer ring (name baseline)
// Text-anchor flips once a label's angle leans far enough left/right that
// centering it on the axis would read off-balance.
const LABEL_ANCHOR_COS_THRESHOLD = 0.2;
// Coarse character budget per wrapped label line.
const LABEL_MAX_CHARS_PER_LINE = 14;

// Greedy word-wrap so long principle names break onto a second line instead of
// running off the SVG. `maxChars` is a coarse character budget per line.
function wrapLines(words, maxChars) {
  const lines = [];
  let current = '';
  for (const w of words) {
    if (!current) { current = w; continue; }
    if (current.length + 1 + w.length <= maxChars) current = `${current} ${w}`;
    else { lines.push(current); current = w; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/* Labels — name and score share an anchor point on a label ring just
   outside the plot. Score is always rendered on the line below the name
   via a tspan(dy), so the two never collide regardless of axis angle. */
/** Click/keyboard wiring for one label; absent entirely when not actionable. */
function labelInteraction(name, actionable, handleClick, handleKey) {
  if (!actionable) return {};
  return { role: 'button', tabIndex: 0, onClick: handleClick(name), onKeyDown: handleKey(name) };
}

/** One axis label: the principle name wrapped over lines, score below it. */
function RadialLabel({ p, angle, outerRadius, actionable, handleClick, handleKey, highlighted, onHover }) {
  const [x, y] = polar(angle, outerRadius + LABEL_OFFSET);
  const isInsuf = !p.hasEvidence;
  const cosA = Math.cos(angle);
  const anchor = cosA > LABEL_ANCHOR_COS_THRESHOLD ? 'start' : cosA < -LABEL_ANCHOR_COS_THRESHOLD ? 'end' : 'middle';
  const lines = wrapLines(p.name.toUpperCase().split(/\s+/), LABEL_MAX_CHARS_PER_LINE);
  return (
    <g
      {...labelInteraction(p.name, actionable && !isInsuf, handleClick, handleKey)}
      className={`qd-radial__label-group${isInsuf ? ' qd-radial__label-group--insuf' : ''}${p.name === highlighted ? ' is-hl' : ''}`}
      {...hoverProps(p.name, onHover)}
    >
      <text
        className={`qd-radial__lab${isInsuf ? ' qd-radial__lab--insuf' : ''}`}
        x={x}
        y={y}
        textAnchor={anchor}
      >
        {lines.map((line, li) => (
          <tspan key={li} x={x} dy={li === 0 ? 0 : '1.15em'}>{line}</tspan>
        ))}
        <tspan
          className={`qd-radial__lab-sub${isInsuf ? ' qd-radial__lab-sub--insuf' : ''}`}
          x={x}
          dy="1.25em"
          style={isInsuf ? undefined : { fill: scoreGradeColorVar(p.score) }}
        >
          {isInsuf ? 'insufficient' : p.score?.toFixed(1)}
        </tspan>
      </text>
    </g>
  );
}

export default function RadialLabels({ principles, angles, outerRadius, onPrincipleClick, handleClick, handleKey, highlighted, onHover }) {
  return (
    <>
      {principles.map((p, i) => (
        <RadialLabel
          key={`lab-${i}`}
          p={p}
          angle={angles[i]}
          outerRadius={outerRadius}
          actionable={!!onPrincipleClick}
          handleClick={handleClick}
          handleKey={handleKey}
          highlighted={highlighted}
          onHover={onHover}
        />
      ))}
    </>
  );
}
