import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ScoreSparkline from './ScoreSparkline.jsx';
import { getGradeThresholds } from '../utils/gradeThresholds.js';
import { t } from '../strings/index.js';

const LABEL = 'Input: score per period';
const POINTS = [{ score: 6, dateLabel: '1 Oct' }, { score: 7.25, dateLabel: '2 Oct' }, { score: 8, dateLabel: '3 Oct' }];
const spark = (points = POINTS) => render(<ScoreSparkline points={points} label={LABEL} />);

describe('ScoreSparkline', () => {
  it('draws nothing under two points: one period is no line', () => {
    expect(spark([]).container).toBeEmptyDOMElement();
    expect(spark([POINTS[0]]).container).toBeEmptyDOMElement();
    expect(render(<ScoreSparkline points={null} label={LABEL} />).container).toBeEmptyDOMElement();
  });

  it('is one image named by its label', () => {
    spark();
    expect(screen.getByRole('img', { name: LABEL })).toBeInTheDocument();
  });

  it('draws a point per period, oldest left, the last one marked, each titled with its date and score', () => {
    const { container } = spark();
    const dots = [...container.querySelectorAll('.score-spark__dot')];
    expect(dots.map((d) => d.getAttribute('cx'))).toEqual(['0', '50', '100']);
    expect(dots.map((d) => d.classList.contains('score-spark__dot--last'))).toEqual([false, false, true]);
    expect(dots.map((d) => d.querySelector('title').textContent)).toEqual([
      t('violations.sparkPoint', { date: '1 Oct', score: '6.0' }),
      t('violations.sparkPoint', { date: '2 Oct', score: '7.3' }),
      t('violations.sparkPoint', { date: '3 Oct', score: '8.0' }),
    ]);
    expect(container.querySelector('.score-spark__line').getAttribute('points').split(' ')).toHaveLength(3);
  });

  it('puts a higher score higher, on the 0 to 10 scale', () => {
    const { container } = spark([{ score: 0, dateLabel: 'a' }, { score: 10, dateLabel: 'b' }]);
    const ys = [...container.querySelectorAll('.score-spark__dot')].map((d) => Number(d.getAttribute('cy')));
    expect(ys[1]).toBe(0);
    expect(ys[0]).toBeGreaterThan(ys[1]);
  });

  it('lays a band behind the line for each grade', () => {
    const { container } = spark();
    expect(container.querySelectorAll('svg rect')).toHaveLength(getGradeThresholds().length + 1);
  });

  it('reads its range: how many periods, from the first to the last', () => {
    spark();
    expect(screen.getByText(t('violations.sparkRange', { count: 3, first: '1 Oct', last: '3 Oct' }))).toHaveClass('score-spark__range');
  });
});
