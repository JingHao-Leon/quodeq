import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const seen = vi.hoisted(() => ({ props: [] }));
vi.mock('./scoreChartParts.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  ScoreHistoryChart: (props) => { seen.props.push(props); return null; },
}));

import { gradeBands, pointChange } from './scoreChartParts.jsx';
import { getGradeThresholds } from '../utils/gradeThresholds.js';
import RunHistoryPanel from '../features/dashboard/components/RunHistoryPanel.jsx';
import DimensionScoreHistoryPanel from '../features/explorer/components/DimensionScoreHistoryPanel.jsx';

const TREND = [
  { runId: 'r2', dateISO: '2026-04-05T10:00:00', dateLabel: 'Apr 5', numericAverage: 6.1, dimensionDetails: [{ dimension: 'security', score: 6.1 }] },
  { runId: 'r1', dateISO: '2026-04-03T10:00:00', dateLabel: 'Apr 3', numericAverage: 5.2, dimensionDetails: [{ dimension: 'security', score: 5.2 }] },
];

describe('gradeBands', () => {
  it('covers the whole scale, best grade first: one band per grade, and the unnamed one under the lowest', () => {
    const bands = gradeBands();
    expect(bands).toHaveLength(getGradeThresholds().length + 1);
    expect(bands.at(-1).name).toBe('');
    expect(bands[0].top).toBe(10);
    expect(bands.at(-1).bottom).toBe(0);
    bands.slice(1).forEach((b, i) => expect(b.top).toBe(bands[i].bottom));
    expect(bands[0].name).toBe(getGradeThresholds()[0][1].toLowerCase());
  });
});

describe('pointChange', () => {
  const data = [{ numericAverage: 6 }, { numericAverage: 6.4 }, { numericAverage: 6.45 }, { numericAverage: 5.95 }, { numericAverage: null }];
  it('writes a move of a tenth or more, signed, from the point before', () => {
    expect(pointChange(data, 1)).toEqual({ up: true, text: '+0.4' });
    expect(pointChange(data, 3)).toEqual({ up: false, text: '\u22120.5' });
  });
  it('nothing for the first point, a missing score, or under a tenth', () => {
    expect([0, 2, 4].map((i) => pointChange(data, i))).toEqual([null, null, null]);
  });
});

describe('the score history chart\'s grade bands and change marks', () => {
  it('are on for the dimension page and the Overview alike', () => {
    seen.props = [];
    render(<RunHistoryPanel trend={TREND} selectedRunId="r2" granularity="day" onGranularityChange={() => {}} />);
    expect(seen.props.at(-1)).toMatchObject({ gradeBands: true, changeMarks: true });
    render(<DimensionScoreHistoryPanel trend={TREND} dimension="security" />);
    expect(seen.props.at(-1)).toMatchObject({ gradeBands: true, changeMarks: true });
  });
});
