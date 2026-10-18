import { useState, useMemo } from 'react';
import { formatPeriodLabel } from '../../../utils/formatters.js';
import { runCounts } from '../headlineStats.js';
import { t } from '../../../strings/index.js';
import {
  ScoreChartWithKeyboard,
  ScoreHistoryPanelFrame,
  computeScoreStats,
  makeScoreTooltip,
  periodOrDateLabel,
  tooltipScore,
} from '../../../components/scoreChartPanel.jsx';
import { PANEL_CHART_HEIGHT_PX, runChartInteraction } from '../../../components/scoreChartHelpers.js';
import { countsLine } from '../../history/components/chartTooltipCounts.jsx';

const MAX_CHART_RUNS = 20;
const MAX_BAR_SIZE = 28;
const MISSING_SCORE = '—';
const GRANULARITY_SUFFIX = {
  day: t('granularity.dayAbbrev'),
  week: t('granularity.weekAbbrev'),
  month: t('granularity.monthAbbrev'),
};


function buildTrendData(trend, granularity = 'day') {
  return [...trend].slice(0, MAX_CHART_RUNS).reverse().map((row, i, arr) => {
    const numericAverage = parseFloat(row.numericAverage);
    return {
      ...row,
      ...runCounts(row),
      numericAverage,
      periodLabel: formatPeriodLabel(row, granularity),
      delta: i > 0 ? numericAverage - parseFloat(arr[i - 1].numericAverage) : null,
    };
  });
}


// Every point here is the PROJECT grade -- the latest known score for each
// dimension, not the grade of that one scan. A scan that only measured
// clean-architecture still plots a full project number, which is what makes
// the line comparable across runs. The cost is that a point refreshed by 1 of
// 7 dimensions looks identical to one backed by a full sweep, so say when the
// refresh was partial. A complete scan needs no annotation.
function partialNote(entry) {
  const refreshed = entry.dimensionsCount;
  const total = entry.accumulatedDimensionsCount;
  if (!Number.isFinite(refreshed) || !Number.isFinite(total) || refreshed >= total) return null;
  return (
    <span className="rht-coverage">
      {t('history.partialRefresh', { count: refreshed, total })}
    </span>
  );
}

// The counts line is the bucket's newest run's criticals, majors and open
// types: the run the tooltip names, not a project-wide figure.
export const RunHistoryTooltip = makeScoreTooltip({
  label: periodOrDateLabel,
  missingScore: MISSING_SCORE,
  extra: (entry) => <>{countsLine(entry, { runLabel: entry.dateLabel })}{partialNote(entry)}</>,
});

const CHART_PRESENTATION = {
  height: PANEL_CHART_HEIGHT_PX,
  fillHeight: true,
  maxBarSize: MAX_BAR_SIZE,
  gradientId: 'scoreAreaGrad',
  tooltip: <RunHistoryTooltip />,
  showSelectedDot: true,
  // As the dimension page's history: each grade's range behind the bars, each change written above its point.
  gradeBands: true,
  changeMarks: true,
};

// Keyboard-only equivalent of the chart's mouse click: one focusable button
// per run, mirroring DimensionScoreHistoryPanel's own ChartKeyboardControls
// usage. Empty when there is nothing to click (ChartKeyboardControls itself
// renders null for an empty list).
// A bucket with no runId has nothing to select, so it gets no control rather
// than a button that calls onBarClick(undefined); the label follows the chart,
// which shows periodLabel once the granularity is week or month.
function buildRunKbdItems(data, onBarClick) {
  if (!onBarClick) return [];
  return data.filter((d) => d.runId).map((d) => ({
    key: d.runId,
    text: t('dashboard.runKbdItem', {
      date: d.periodLabel || d.dateLabel,
      score: tooltipScore(d.numericAverage, '?'),
    }),
    onActivate: () => onBarClick(d.runId),
  }));
}

/** Hover setter that also reports the hovered run to the prefetcher: a bar
 * warms its run, leaving the chart cancels the pending warm-up. */
export function hoverWithPrefetch(setHoveredIndex, data, onBarHover, onBarHoverEnd) {
  return (index) => {
    setHoveredIndex(index);
    if (index === null) onBarHoverEnd?.();
    else if (data[index]?.runId) onBarHover?.(data[index].runId);
  };
}

export default function RunHistoryPanel({ trend = [], selectedRunId = null, onBarClick, onBarHover, onBarHoverEnd, granularity = 'day', onGranularityChange }) {
  const [hoveredIndex, setHoveredIndexState] = useState(null);
  // Hooks must run in the same order every render, so compute before any early return.
  const data = useMemo(() => buildTrendData(trend, granularity), [trend, granularity]);
  const setHoveredIndex = hoverWithPrefetch(setHoveredIndexState, data, onBarHover, onBarHoverEnd);

  // The parent only mounts this panel from the second evaluation, so an empty
  // trend shouldn't happen, but guard it. A single bucket (every run in one
  // week or month) still draws its bar: the runs exist and the score is real.
  if (!trend || trend.length < 1) return null;

  return (
    <ScoreHistoryPanelFrame
      ariaLabel={t('overview.scoreHistoryAria')}
      count={data.length}
      suffix={GRANULARITY_SUFFIX[granularity] || GRANULARITY_SUFFIX.day}
      granularity={granularity}
      onGranularityChange={onGranularityChange}
      stats={computeScoreStats(data)}
    >
      <ScoreChartWithKeyboard
        data={data}
        chart={CHART_PRESENTATION}
        interaction={runChartInteraction({ hoveredIndex, setHoveredIndex, selectedRunId, onBarClick })}
        kbdLabel={t('dashboard.runHistoryKbdLabel')}
        kbdItems={buildRunKbdItems(data, onBarClick)}
      />
    </ScoreHistoryPanelFrame>
  );
}
