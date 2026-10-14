/**
 * The score-history chart itself, shared by the panels that draw one:
 * Overview's RunHistoryPanel and the Explorer's DimensionScoreHistoryPanel.
 *
 * Both render the same recharts composition — dashed reference lines, a
 * grade-coloured bar per point, an accent trend line over them — and differ
 * only in the tooltip, whether they fill an area under the line, whether the
 * selected point gets a dot, and how tall the chart is. Those are props.
 *
 * The panel chrome around it — header, period selector, stats line, tooltip
 * cards and the keyboard-controls pairing — is scoreChartPanel.jsx.
 */
import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  cssVar,
  scoreBarColor,
  refLineValues,
  CHART_MARGIN,
  SELECTED_BAR_OPACITY,
  DESELECTED_BAR_OPACITY,
  HOVER_STROKE_WIDTH,
  REF_LINE_OPACITY_EVEN,
  REF_LINE_OPACITY_ODD,
} from './scoreChartHelpers.js';
import { SCORE_SCALE_MAX } from '../constants.js';
import { getGradeThresholds } from '../utils/gradeThresholds.js';
import { scoreGradeColorVar } from '../utils/gradeFormatting.js';

// Bars are read as a fraction of a full 0-10 score, so the axis is absolute
// rather than fitted to the data (see RunHistoryPanel's note).
const SCORE_AXIS_DOMAIN = [0, SCORE_SCALE_MAX];
const SELECTED_DOT_RADIUS = 4;
const TREND_LINE_STROKE_WIDTH = 2;
const TREND_LINE_OPACITY = 0.9;
const AREA_TOP_OPACITY = 0.08;
const TOOLTIP_OFFSET = 20;

/**
 * The dot marking the selected run on the trend line. Renders nothing for
 * every other point, which is how recharts draws a single-point marker.
 */
export function SelectedDot({ cx, cy, payload, selectedRunId }) {
  if (payload?.runId !== selectedRunId) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={SELECTED_DOT_RADIUS}
      fill={cssVar('--color-chart-line')}
      stroke="white"
      strokeWidth={HOVER_STROKE_WIDTH}
    />
  );
}

// Not components: recharts finds <Cell> and <ReferenceLine> children by
// inspecting <Bar>'s / the chart's immediate JSX children, so wrapping them in
// a component would hide them and the bars would fall back to a default fill.
function renderScoreBarCells(data, selectedRunId, hoveredIndex) {
  return data.map((entry, i) => (
    <Cell
      key={entry.runId ?? i}
      fill={scoreBarColor(entry.numericAverage)}
      opacity={entry.runId === selectedRunId ? SELECTED_BAR_OPACITY : DESELECTED_BAR_OPACITY}
      stroke={hoveredIndex === i ? cssVar('--color-chart-stroke') : 'none'}
      strokeWidth={hoveredIndex === i ? HOVER_STROKE_WIDTH : 0}
    />
  ));
}

function renderScoreReferenceLines() {
  return refLineValues(SCORE_AXIS_DOMAIN).map((y, i) => (
    <ReferenceLine
      key={y}
      y={y}
      stroke={cssVar('--color-chart-axis')}
      strokeDasharray="4 4"
      strokeOpacity={i % 2 ? REF_LINE_OPACITY_ODD : REF_LINE_OPACITY_EVEN}
    />
  ));
}

const BAND_OPACITY = 0.07;
const BAND_LABEL_SIZE = 9;
const CHANGE_MIN = 0.1;
const CHANGE_LABEL_SIZE = 10;
const CHANGE_LABEL_LIFT = 8;
const ONE_DECIMAL = 1;

const MINUS = '\u2212';

/**
 * Each grade's score range, best first: `{bottom, top, name}` (the name in
 * lower case), from the app's grade thresholds down to 0.
 */
export function gradeBands() {
  const rows = getGradeThresholds();
  const bounds = [SCORE_SCALE_MAX, ...rows.map(([min]) => min), 0];
  return bounds.slice(0, -1).map((top, i) => ({ top, bottom: bounds[i + 1], name: (rows[i]?.[1] || '').toLowerCase() }));
}

/** The grade bands behind the bars: each grade's score range, faintly in its colour, named at the left. */
function renderGradeBands() {
  return gradeBands().map(({ top, bottom, name }) => {
    const colour = scoreGradeColorVar((top + bottom) / 2);
    return (
      <ReferenceArea key={`band-${bottom}`} y1={bottom} y2={top} fill={colour} fillOpacity={BAND_OPACITY} stroke="none"
        label={name ? { value: name, position: 'insideTopLeft', fill: colour, fontSize: BAND_LABEL_SIZE } : undefined} />
    );
  });
}

/** A point's change from the one before ("+0.4", "\u22120.3"); null for the first point, a missing score, or under a tenth. */
export function pointChange(data, index) {
  const prev = data[index - 1]?.numericAverage;
  const cur = data[index]?.numericAverage;
  if (prev == null || cur == null) return null;
  const delta = cur - prev;
  if (Math.abs(delta) < CHANGE_MIN) return null;
  return { up: delta > 0, text: `${delta > 0 ? '+' : MINUS}${Math.abs(delta).toFixed(ONE_DECIMAL)}` };
}

/** A point's change from the one before, written above it when it moved. */
function makeChangeLabel(data) {
  return function ChangeLabel({ x, y, index }) {
    const change = pointChange(data, index);
    if (!change) return null;
    return (
      <text x={x} y={y - CHANGE_LABEL_LIFT} textAnchor="middle" fontSize={CHANGE_LABEL_SIZE}
        fill={change.up ? cssVar('--color-accent') : cssVar('--color-sev-critical-text')}>
        {change.text}
      </text>
    );
  };
}

function renderAreaGradient(gradientId) {
  return (
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={cssVar('--color-accent')} stopOpacity={AREA_TOP_OPACITY} />
        <stop offset="100%" stopColor={cssVar('--color-accent')} stopOpacity={0} />
      </linearGradient>
    </defs>
  );
}

// Hit-detection lives on the chart, not on the Bar: the Area gradient and the
// Line stroke layer over the bars and would swallow the click before it
// reached them. Recharts already resolves the nearest category for us as
// `activeTooltipIndex` on the chart-level events.
function makeChartClickHandler(data, onActivate) {
  return (state) => {
    const idx = state?.activeTooltipIndex;
    if (idx == null) return;
    const point = data[idx];
    if (point?.runId) onActivate(point);
  };
}

/**
 * The score-history chart.
 *
 * @param {Object} props
 * @param {Array} props.data Chart points, oldest first, each with runId/dateLabel/numericAverage.
 * @param {number} props.height Chart height in px; a minimum when `fillHeight` is set.
 * @param {boolean} [props.fillHeight] Stretch to the container instead of fixing the height.
 * @param {number} props.maxBarSize Widest a bar may draw.
 * @param {string} [props.gradientId] Draw a filled area under the line, using this gradient id.
 * @param {React.ReactElement} props.tooltip The panel's tooltip content element.
 * @param {boolean} [props.showSelectedDot] Mark the selected run on the trend line.
 * @param {boolean} [props.gradeBands] Draw each grade's score range behind the bars.
 * @param {boolean} [props.changeMarks] Write each point's change from the one before above it.
 * @param {number|null} props.hoveredIndex
 * @param {(index: number|null) => void} props.setHoveredIndex
 * @param {string|null} props.selectedRunId
 * @param {((point: Object) => void)|undefined} props.onActivate Called with the clicked point, when clicking is enabled.
 */
export function ScoreHistoryChart({
  data, height, fillHeight, maxBarSize, gradientId, tooltip, showSelectedDot, gradeBands = false, changeMarks = false,
  hoveredIndex, setHoveredIndex, selectedRunId, onActivate,
}) {
  const handleClick = onActivate ? makeChartClickHandler(data, onActivate) : undefined;
  // One label component per data set, not per render: recharts remounts every label when it changes.
  const changeLabel = useMemo(() => (changeMarks ? makeChangeLabel(data) : undefined), [changeMarks, data]);
  return (
    <ResponsiveContainer
      width="100%"
      height={fillHeight ? '100%' : height}
      minHeight={fillHeight ? height : undefined}
    >
      <ComposedChart
        data={data}
        margin={CHART_MARGIN}
        onMouseMove={(state) => setHoveredIndex(state?.activeTooltipIndex ?? null)}
        onMouseLeave={() => setHoveredIndex(null)}
        onClick={handleClick}
        style={onActivate ? { cursor: 'pointer' } : undefined}
      >
        {gradientId ? renderAreaGradient(gradientId) : null}
        {/* Axes and grid are deliberately hidden: the panel header carries the
            numbers, and the chart reads as clean edge-to-edge bars. */}
        <XAxis dataKey="dateLabel" hide />
        <YAxis domain={SCORE_AXIS_DOMAIN} hide />
        <Tooltip cursor={false} isAnimationActive={false} offset={TOOLTIP_OFFSET} content={tooltip} />
        {gradeBands ? renderGradeBands() : renderScoreReferenceLines()}
        {gradientId ? (
          <Area dataKey="numericAverage" type="monotone" fill={`url(#${gradientId})`} stroke="none" isAnimationActive={false} />
        ) : null}
        <Bar dataKey="numericAverage" radius={[0, 0, 0, 0]} maxBarSize={maxBarSize} isAnimationActive={false}>
          {renderScoreBarCells(data, selectedRunId, hoveredIndex)}
        </Bar>
        <Line
          isAnimationActive={false}
          dataKey="numericAverage"
          type="monotone"
          stroke={cssVar('--color-accent')}
          strokeOpacity={TREND_LINE_OPACITY}
          strokeWidth={TREND_LINE_STROKE_WIDTH}
          dot={showSelectedDot ? <SelectedDot selectedRunId={selectedRunId} /> : false}
          activeDot={false}
          label={changeLabel}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
