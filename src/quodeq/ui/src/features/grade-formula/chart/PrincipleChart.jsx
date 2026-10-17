import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../../strings/index.js';
import { pluralKey } from '../../../utils/plural.js';
import { chartScale, maxSavedWeight, principleDots, DIR } from './chartScale.js';
import { Backdrop, Curves } from './ChartBackdrop.jsx';

const DOT_RADIUS = 4;
const FLIP_DOT_RADIUS = 6;
const HIT_RADIUS = 9;
// Past this many viewBox units per pixel (a phone-width chart) the text stops growing in viewBox
// terms, so the band labels still fit the right margin.
const MAX_UNITS_PER_PX = 2.6;

function Dots({ dots, litProject, onHoverProject }) {
  return (
    <g>
      {dots.map((d) => d.dir !== DIR.SAME && (
        <line key={`s-${d.key}`} className={`gf-stem gf-stem--${d.dir}`} x1={d.x} x2={d.x} y1={d.yBefore} y2={d.yAfter} />
      ))}
      {dots.map((d) => {
        const dim = litProject && litProject !== d.project;
        const cls = `gf-dot gf-dot--${d.dir}${d.flip ? ' gf-dot--flip' : ''}${dim ? ' gf-dot--dim' : ''}`;
        return (
          <g key={d.key}>
            {/* cy as a CSS property animates the move; the attribute is the fallback where it is not supported. */}
            <circle className={cls} cx={d.x} cy={d.yAfter} style={{ cy: d.yAfter }} r={d.flip ? FLIP_DOT_RADIUS : DOT_RADIUS} />
            <circle className="gf-dot-hit" cx={d.x} cy={d.yAfter} r={HIT_RADIUS}
              onMouseEnter={() => onHoverProject(d.project)} onMouseLeave={() => onHoverProject(null)}>
              <title>{t('gradeFormula.dotTitle', { principle: d.id, project: d.project, dimension: d.dimension, before: d.before.toFixed(1), after: d.after.toFixed(1) })}</title>
            </circle>
          </g>
        );
      })}
    </g>
  );
}

/** Every principle: finding weight across, score up, under the saved formula and the draft. */
export default function PrincipleChart({ inputs, saved, draft, highlight, litProject, onHoverProject }) {
  const scale = useMemo(() => chartScale(maxSavedWeight(inputs, saved)), [inputs, saved]);
  const dots = useMemo(() => principleDots(inputs, saved, draft), [inputs, saved, draft]);
  const moved = dots.filter((d) => d.dir !== DIR.SAME).length;
  const flips = dots.filter((d) => d.flip).length;
  // viewBox units per screen pixel, so chart text keeps one pixel size at any width.
  const figRef = useRef(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = figRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setK(e.contentRect.width ? scale.width / e.contentRect.width : 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [scale.width]);
  return (
    <figure className="gf-chart-wrap" ref={figRef} style={{ '--gf-k': Math.min(k, MAX_UNITS_PER_PX) }}>
      <svg className={`gf-chart${highlight ? ` gf-chart--hl-${highlight}` : ''}`} viewBox={`0 0 ${scale.width} ${scale.height}`}
        role="img" aria-label={t('gradeFormula.chartAria')}>
        <Backdrop scale={scale} draft={draft} />
        <Curves scale={scale} saved={saved} draft={draft} />
        <Dots dots={dots} litProject={litProject} onHoverProject={onHoverProject} />
      </svg>
      <figcaption className="gf-chart__count">
        {moved === 0
          ? t(pluralKey(dots.length, 'gradeFormula.chartCountRestOne', 'gradeFormula.chartCountRest'), { shown: dots.length })
          : t(pluralKey(dots.length, 'gradeFormula.chartCountOne', 'gradeFormula.chartCount'), { shown: dots.length, moved, flips })}
      </figcaption>
    </figure>
  );
}
