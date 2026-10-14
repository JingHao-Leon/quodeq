import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import FindingsHead from './FindingsHead.jsx';
import { scopeMetrics, RISK_SMALL } from '../models/findingMetrics.js';
import { RISK_ZONE } from '../vocab/riskZone.js';
import { t } from '../strings/index.js';

const metrics = (risk = null) => scopeMetrics({ sevCounts: { critical: 1, major: 2 }, total: 3, compliance: 7, files: 10, risk });
const head = (props = {}) => render(<FindingsHead title="src/api" sub="folder" filesHint="10 files checked" metrics={metrics()} {...props} />);
const tileLabels = (container) => [...container.querySelectorAll('.findings-head__label')].map((n) => n.textContent);
const statOf = (label) => screen.getByText(label).closest('.findings-head__stat');

describe('FindingsHead', () => {
  it('reads violations, pass rate, per 100 files and critical per 1k, with no Risk unless asked', () => {
    const { container } = head();
    expect(tileLabels(container)).toEqual([
      t('violations.scopeStatViolations'), t('violations.scopeStatPass'), t('violations.scopeStatPer100'), t('violations.scopeStatCriticalK'),
    ]);
    expect(statOf(t('violations.scopeStatPass'))).toHaveTextContent('70%');
    expect(statOf(t('violations.scopeStatPer100'))).toHaveTextContent('30.0');
    expect(statOf(t('violations.scopeStatCriticalK'))).toHaveTextContent('100.0');
  });

  it('one file leaves out per 100 files and critical per 1k', () => {
    const { container } = head({ oneFile: true });
    expect(tileLabels(container)).toEqual([t('violations.scopeStatViolations'), t('violations.scopeStatPass')]);
  });

  it('a folder or area shows its Risk zone, or that it is too small to judge', () => {
    const { unmount } = head({ showRisk: true, metrics: metrics({ density: 0.9, zone: RISK_ZONE.FIX_FIRST }) });
    expect(statOf(t('violations.scopeStatRisk'))).toHaveTextContent(t('map.riskZoneNameFixFirst'));
    expect(statOf(t('violations.scopeStatRisk'))).toHaveTextContent(t('violations.scopeStatRiskHint', { density: '0.90' }));
    unmount();
    head({ showRisk: true, metrics: metrics({ density: 4, zone: RISK_SMALL }) });
    expect(statOf(t('violations.scopeStatRisk'))).toHaveTextContent(t('map.riskKindSmall'));
  });

  it('a graded header leads with the ring and reads its description under the title', () => {
    const { container } = head({ grade: { score: 7.7, insufficient: false, hint: 'thin' }, description: 'What it means' });
    expect(container.querySelector('.findings-head__ring .dim-gauge-card__gauge')).not.toBeNull();
    expect(container.querySelector('.findings-head__desc')).toHaveTextContent('What it means');
    expect(container.querySelector('.findings-head__hint')).toHaveTextContent('thin');
    expect(screen.queryByRole('button', { name: t('evaluate.aboutTitle', { title: 'src/api' }) })).toBeNull();
  });

  it('an insufficient grade draws the dashed ring', () => {
    const { container } = head({ grade: { score: null, insufficient: true, hint: null } });
    expect(container.querySelector('.dim-gauge-card__gauge--insuf')).not.toBeNull();
  });

  it('an ungraded header has no ring and keeps its description behind the title\'s ?', () => {
    const { container } = head({ description: 'What it means' });
    expect(container.querySelector('.findings-head__ring')).toBeNull();
    expect(container.querySelector('.findings-head__desc')).toBeNull();
    expect(screen.getByRole('button', { name: t('evaluate.aboutTitle', { title: 'src/api' }) })).toBeInTheDocument();
  });

  it('the tiles and the severity badges call their actions, never one button inside another', () => {
    const actions = { onViolations: vi.fn(), onCompliance: vi.fn(), onSeverity: vi.fn() };
    const { container } = head({ actions });
    fireEvent.click(screen.getByRole('button', { name: t('overview.showAllViolationsAria') }));
    fireEvent.click(screen.getByRole('button', { name: t('overview.showComplianceAria') }));
    fireEvent.click(screen.getByRole('button', { name: 'critical severity' }));
    expect([actions.onViolations, actions.onCompliance].map((f) => f.mock.calls.length)).toEqual([1, 1]);
    expect(actions.onSeverity).toHaveBeenCalledWith('critical');
    expect(container.querySelector('button button')).toBeNull();
  });

  it('without actions, or with nothing to open, nothing is a button; and there is no learn-more link', () => {
    head({ metrics: scopeMetrics({ sevCounts: {}, total: 0, compliance: 0, files: 4 }), actions: { onViolations: vi.fn(), onCompliance: vi.fn() } });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(t('helpHint.learnMore'))).toBeNull();
  });

  it('a graded ring holds the score only; the grade word sits under it, in the ring\'s colour', () => {
    const { container, unmount } = head({ grade: { score: 7.7, insufficient: false, hint: null } });
    expect(container.querySelector('.findings-head__ring svg .dim-gauge-card__grade')).toBeNull();
    const word = container.querySelector('.findings-head__gradeword');
    expect(word.textContent).toMatch(/^[A-Z]+$/);
    expect(word.style.color).not.toBe('');
    unmount();
    const insufficient = head({ grade: { score: null, insufficient: true, hint: null } });
    expect(insufficient.container.querySelector('.findings-head__gradeword')).toHaveTextContent(t('overview.insufficientGrade'));
  });

  it('a tile\'s change: the arrow follows the number, the colour says whether that is good', () => {
    const { container } = head({ changes: { passPct: -10, per100: 2.5, criticalPerK: -3 } });
    const [pass, per100, critical] = [...container.querySelectorAll('.findings-head__change .trend-badge')];
    expect(pass).toHaveTextContent('-10');
    expect(pass).toHaveClass('trend-badge-down');
    expect(pass.querySelector('.trend-arrow')).toHaveClass('trend-down');
    expect(per100).toHaveTextContent('+2.5');
    expect(per100).toHaveClass('trend-badge-down');
    expect(per100.querySelector('.trend-arrow')).toHaveClass('trend-up');
    expect(critical).toHaveClass('trend-badge-up');
    expect(critical.querySelector('.trend-arrow')).toHaveClass('trend-down');
  });

  it('no change, no arrow', () => {
    const { container } = head({ changes: { passPct: null, per100: null, criticalPerK: null } });
    expect(container.querySelector('.findings-head__change')).toBeNull();
  });

  it('a principle\'s requirements replace per 100 files and critical per 1k', () => {
    const { container } = head({ requirements: { failing: 2, total: 5 } });
    expect(tileLabels(container)).toEqual([t('violations.scopeStatViolations'), t('violations.scopeStatPass'), t('violations.scopeStatReqs')]);
    expect(statOf(t('violations.scopeStatReqs'))).toHaveTextContent(t('violations.scopeStatReqsValue', { failing: 2, total: 5 }));
  });

  it('a past run says which, and offers the way back to the latest', () => {
    const onBack = vi.fn();
    head({ pastRun: { when: 'Oct 1', onBack } });
    expect(screen.getByText(t('violations.headPast', { when: 'Oct 1' }))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('violations.headBackToLatest') }));
    expect(onBack).toHaveBeenCalled();
  });

  it('a long description is cut to two lines, with more and less', () => {
    const tall = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(80);
    const { container } = head({ grade: { score: 7.7, insufficient: false, hint: null }, description: 'A long one' });
    expect(container.querySelector('.findings-head__desc')).toHaveClass('findings-head__desc--clamped');
    fireEvent.click(screen.getByRole('button', { name: t('violations.scopeDescMore') }));
    expect(container.querySelector('.findings-head__desc')).not.toHaveClass('findings-head__desc--clamped');
    expect(screen.getByRole('button', { name: t('violations.scopeDescLess') })).toHaveAttribute('aria-expanded', 'true');
    tall.mockRestore();
  });

  it('a short description offers no more', () => {
    head({ grade: { score: 7.7, insufficient: false, hint: null }, description: 'Short' });
    expect(screen.queryByRole('button', { name: t('violations.scopeDescMore') })).toBeNull();
  });

  it('the slim bar shows once the header scrolls away above', () => {
    let report = null;
    vi.stubGlobal('IntersectionObserver', class { constructor(cb) { report = cb; } observe() {} disconnect() {} });
    const { container } = head({ grade: { score: 7.7, insufficient: false, hint: null } });
    const slim = container.querySelector('.findings-head__slim');
    expect(slim).not.toHaveClass('is-shown');
    expect(container.querySelector('.findings-head__sticky')).toHaveAttribute('aria-hidden', 'true');
    act(() => report([{ isIntersecting: false, boundingClientRect: { top: -50 } }]));
    expect(slim).toHaveClass('is-shown');
    expect(slim).toHaveTextContent('src/api');
    expect(slim).toHaveTextContent(t('violations.scopeViolations', { count: 3 }));
    expect(slim).toHaveTextContent(t('overview.cardPass', { pct: 70 }));
    vi.unstubAllGlobals();
  });
});
