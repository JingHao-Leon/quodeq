// The chart's fixed parts: grade bands, grid, ticks and axis titles, then the
// formula curves and floors drawn over them.
import { t } from '../../../strings/index.js';
import { SCORE_SCALE_MAX } from '../../../constants.js';
import { GRADE_ORDER, GRADE_CLASS } from '../impact/impactModel.js';

const LABEL_GAP = 8;
const TICK_DROP = 18;
const TITLE_DROP = 6;
const GRID_STEP = 2;
const GRID_LINES = Array.from({ length: SCORE_SCALE_MAX / GRID_STEP + 1 }, (_, i) => i * GRID_STEP);
const SAMPLES = 160;
const Y_TITLE_X = 12;
const LABEL_RISE = 5;

function bandEdges(thresholds) {
  return [SCORE_SCALE_MAX, ...thresholds.map(([min]) => min), 0];
}

export function Backdrop({ scale, draft }) {
  const { plot } = scale;
  const edges = bandEdges(draft.gradeThresholds);
  const labels = [...draft.gradeThresholds.map(([, label]) => label), GRADE_ORDER[GRADE_ORDER.length - 1]];
  const middle = (plot.top + plot.bottom) / 2;
  return (
    <g>
      {labels.map((label, i) => {
        const top = scale.y(edges[i]);
        return (
          <g key={label}>
            <rect className={`gf-band gf-band--${GRADE_CLASS[GRADE_ORDER[i]]}`} x={plot.left} width={plot.right - plot.left}
              y={top} height={scale.y(edges[i + 1]) - top} />
            <text className="gf-band__label" x={plot.right + LABEL_GAP} y={(top + scale.y(edges[i + 1])) / 2}>{label}</text>
          </g>
        );
      })}
      {GRID_LINES.map((v) => (
        <g key={v}>
          <line className="gf-grid" x1={plot.left} x2={plot.right} y1={scale.y(v)} y2={scale.y(v)} />
          <text className="gf-tick gf-tick--y" x={plot.left - LABEL_GAP} y={scale.y(v)}>{v}</text>
        </g>
      ))}
      {scale.xTicks.map((v) => (
        <text key={v} className="gf-tick gf-tick--x" x={scale.x(v)} y={plot.bottom + TICK_DROP}>{v}</text>
      ))}
      <text className="gf-axis-title" x={(plot.left + plot.right) / 2} y={scale.height - TITLE_DROP}>{t('gradeFormula.chartAxisX')}</text>
      <text className="gf-axis-title" transform={`rotate(-90 ${Y_TITLE_X} ${middle})`} x={Y_TITLE_X} y={middle}>{t('gradeFormula.chartAxisY')}</text>
    </g>
  );
}

function curvePath(scale, score) {
  const logMax = Math.log1p(scale.xMax);
  return Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const wv = Math.expm1((i / SAMPLES) * logMax);
    return `${i === 0 ? 'M' : 'L'}${scale.x(wv).toFixed(1)},${scale.y(Math.max(0, score(wv))).toFixed(1)}`;
  }).join(' ');
}

const baseScore = (params) => (wv) => SCORE_SCALE_MAX / (1 + params.baseK * wv);
const ceilScore = (params) => (wv) => SCORE_SCALE_MAX - Math.log2(1 + wv) * params.ceilScale;

function Floor({ scale, value, labelKey }) {
  const y = scale.y(value);
  const x = scale.plot.right - LABEL_GAP;
  return (
    <g>
      <line className="gf-floor" x1={scale.plot.left} x2={scale.plot.right} y1={y} y2={y} />
      <text className="gf-floor__label gf-floor__label--halo" x={x} y={y - LABEL_RISE}>{t(labelKey, { value })}</text>
      <text className="gf-floor__label" x={x} y={y - LABEL_RISE}>{t(labelKey, { value })}</text>
    </g>
  );
}

export function Curves({ scale, saved, draft }) {
  return (
    <g>
      <path className="gf-curve gf-curve--ceil-saved" d={curvePath(scale, ceilScore(saved))} />
      <path className="gf-curve gf-curve--ceil" d={curvePath(scale, ceilScore(draft))} />
      <path className="gf-curve gf-curve--base-saved" d={curvePath(scale, baseScore(saved))} />
      <path className="gf-curve gf-curve--base" d={curvePath(scale, baseScore(draft))} />
      <Floor scale={scale} value={draft.floorMinor} labelKey="gradeFormula.floorMinorLabel" />
      <Floor scale={scale} value={draft.floorMajor} labelKey="gradeFormula.floorMajorLabel" />
    </g>
  );
}
