import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePrincipleScoreHistory } from './usePrincipleHead.jsx';
import { readScope } from './scopeModel.js';
import { t } from '../../../strings/index.js';

const series = vi.hoisted(() => ({ rows: [], args: null }));
vi.mock('../../../hooks/usePrincipleSeries.js', () => ({
  usePrincipleSeries: (...args) => { series.args = args; return { rows: series.rows, loading: false, error: null }; },
}));

const SCOPE = readScope({ kind: 'principle', dimension: 'security', principle: 'Input' });
const HISTORY = { project: 'p1', selectedSource: 'local', granularity: 'day' };
// The rows arrive newest first, one run a day in October 2026 (1 Oct is a Thursday).
const day = (n) => `2026-10-${String(n).padStart(2, '0')}T12:00:00`;
const row = (n, principles) => ({ runId: `r${n}`, dateISO: day(n), dateLabel: `${n} Oct`, principles });
const scored = (n, score) => row(n, [{ principle: 'Input', score }, { principle: 'Output', score: 1 }]);

function run(scope = SCOPE, history = HISTORY) {
  return renderHook(() => usePrincipleScoreHistory({ isPrinciple: scope.kind === 'principle', scope, history })).result.current;
}

describe('usePrincipleScoreHistory', () => {
  beforeEach(() => { series.rows = []; series.args = null; });

  it('is null while the series loads (no rows yet)', () => {
    expect(run()).toBeNull();
    expect(series.args).toEqual(['p1', 'local', 'security']);
  });

  it('reads the principle\'s own score per day, oldest first, with its dates and the line\'s label', () => {
    series.rows = [scored(3, 7.5), scored(2, 7), scored(1, 6)];
    const history = run();
    expect(history.points.map((p) => [p.dateLabel, p.score])).toEqual([['1 Oct', 6], ['2 Oct', 7], ['3 Oct', 7.5]]);
    expect(history.label).toBe(t('violations.sparkAria', { principle: 'Input' }));
  });

  it('matches the principle by its exact name: a run that did not score it adds no point', () => {
    series.rows = [row(3, [{ principle: 'Output', score: 9 }]), scored(2, 7), scored(1, 6)];
    expect(run().points.map((p) => p.score)).toEqual([6, 7]);
  });

  it('groups the runs as the chart does (one point a week on a weekly chart)', () => {
    // 1-4 Oct and 5-11 Oct fall in two ISO weeks.
    series.rows = [scored(9, 8), scored(6, 7), scored(4, 6), scored(2, 5)];
    expect(run(SCOPE, { ...HISTORY, granularity: 'week' }).points.map((p) => p.score)).toEqual([6, 8]);
  });

  it('keeps the newest 16 periods at most', () => {
    series.rows = Array.from({ length: 20 }, (_, i) => scored(20 - i, 20 - i));
    const { points } = run();
    expect(points).toHaveLength(16);
    expect([points[0].score, points.at(-1).score]).toEqual([5, 20]);
  });

  it('asks nothing and reads nothing for any other scope', () => {
    series.rows = [scored(2, 7), scored(1, 6)];
    expect(run(readScope({ kind: 'dimension', dimension: 'security' }))).toBeNull();
    expect(series.args).toEqual([null, 'local', null]);
  });
});
