import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import OverviewSkeleton from './OverviewSkeleton.jsx';
import { FIX_FIRST_SHOWN } from '../../../components/FixFirstPanel.jsx';

// The skeleton draws the Overview's own layout with dimmed blocks; while the
// server rebuilds a project's scores, it shows the grade it last computed,
// dimmed, in the ring's place, with the updating mark, instead of an empty ring.

const ring = (container) => container.querySelector('.findings-head__ring');

describe('OverviewSkeleton', () => {
  it('draws the Overview\'s sections in its order: header, since strip, cards, history beside the radial, Fix first beside Where', () => {
    const { container } = render(<OverviewSkeleton projectName="quodeq" />);
    const sections = [...container.querySelector('.overview-skeleton').children].map((n) => n.className);
    expect(sections).toEqual([
      'findings-head qd-cards-panel', 'overview-since', 'quality-dimensions', 'qd-top-grid overview-top-grid', 'explorer-bottom',
    ]);
  });

  it('fills each section with the loaded one\'s parts: four tiles, compact cards, the chart and radial, the list rows', () => {
    const { container } = render(<OverviewSkeleton projectName="quodeq" />);
    expect(container.querySelectorAll('.findings-head__stats .findings-head__stat')).toHaveLength(4);
    expect(container.querySelectorAll('.dimensions-grid .dim-gauge-card--compact').length).toBeGreaterThan(0);
    expect(container.querySelector('.overview-top-grid [data-testid="run-history-panel-placeholder"]')).not.toBeNull();
    expect(container.querySelector('.overview-top-grid .qd-top-right .qd-radial')).not.toBeNull();
    expect(container.querySelectorAll('.fix-first-panel .overview-skeleton__bar--row')).toHaveLength(FIX_FIRST_SHOWN);
    expect(container.querySelector('.explorer-bottom .explorer-where .risk-areas-panel')).not.toBeNull();
  });

  it('is busy, and hides its blocks from assistive tech while the sub line says what it waits on', () => {
    const { container } = render(<OverviewSkeleton projectName="quodeq" />);
    expect(container.querySelector('.overview-skeleton')).toHaveAttribute('aria-busy', 'true');
    const hidden = ['.findings-head__ring', '.findings-head__stats', '.overview-since', '.quality-dimensions', '.overview-top-grid', '.explorer-bottom'];
    expect(hidden.filter((sel) => container.querySelector(sel).getAttribute('aria-hidden') !== 'true')).toEqual([]);
    expect(container.querySelector('.findings-head__who')).not.toHaveAttribute('aria-hidden');
  });

  it('draws an empty ring and the loading line without a last known grade', () => {
    const { container } = render(<OverviewSkeleton projectName="quodeq" />);
    expect(container.querySelector('.overview-skeleton__last-known')).toBeNull();
    expect(ring(container).querySelector('.overview-skeleton__ring')).toBeEmptyDOMElement();
    expect(ring(container).querySelector('.overview-skeleton__bar--gradeword')).not.toBeNull();
    expect(container.querySelector('.term-header__sub')).toHaveTextContent('loading quodeq');
  });

  it('shows the last known score in the ring and its grade under it, and says it is updating', () => {
    const { container } = render(<OverviewSkeleton projectName="quodeq" lastKnown={{ grade: 'Good', score: 7.4, files: 12 }} />);
    expect(ring(container).querySelector('.overview-skeleton__ring-score')).toHaveTextContent('7.4');
    expect(ring(container).querySelector('.findings-head__gradeword.overview-skeleton__last-known')).toHaveTextContent('Good');
    expect(ring(container).querySelector('.overview-skeleton__bar--gradeword')).toBeNull();
    expect(container.querySelector('.term-header__sub')).toHaveTextContent('quodeq: last grade 7.4 B, updating');
  });

  it('keeps the grade\'s block when the last known summary has a score but no grade', () => {
    const { container } = render(<OverviewSkeleton lastKnown={{ grade: null, score: 6.1 }} />);
    expect(ring(container).querySelector('.overview-skeleton__ring-score')).toHaveTextContent('6.1');
    expect(ring(container).querySelector('.overview-skeleton__bar--gradeword')).not.toBeNull();
    expect(container.querySelector('.term-header__sub')).toHaveTextContent('last grade 6.1');
  });

  it('treats a summary with neither grade nor score as none', () => {
    const { container } = render(<OverviewSkeleton lastKnown={{ grade: null, score: null, files: 3 }} />);
    expect(container.querySelector('.overview-skeleton__last-known')).toBeNull();
    expect(container.querySelector('.term-header__sub')).toHaveTextContent('loading');
  });

  it('draws the run page\'s footprint for a run: the run\'s header, no history or radial, folders in the Where panel', () => {
    const { container } = render(<OverviewSkeleton projectName="quodeq" run />);
    const sections = [...container.querySelector('.overview-skeleton').children].map((n) => n.className);
    expect(sections).toEqual(['findings-head qd-cards-panel', 'overview-since', 'quality-dimensions', 'explorer-bottom']);
    expect(container.querySelector('.term-header__name')).toHaveTextContent(/^run$/);
    expect(container.querySelector('.explorer-where .folders-panel')).not.toBeNull();
  });
});
