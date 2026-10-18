import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ScopedFindings from './ScopedFindings.jsx';
import { readScope } from './scopeModel.js';
import { SidePaneProvider } from '../../side-pane/index.js';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { t } from '../../../strings/index.js';

// The open code blocks measure off-DOM on a canvas jsdom does not have.
vi.mock('../../../utils/pretext.js', async (importOriginal) => ({
  ...(await importOriginal()), measureWidth: () => 0, cssFontFromElement: () => '12px monospace',
}));
vi.mock('../../explorer/hooks/useStandardDescriptions.js', () => ({
  useStandardDescriptions: (dimension) => ({ principleDescriptions: dimension ? { Input: 'Validate what comes in' } : null }),
}));

const v = (over) => ({ file: 'src/app.py', line: 30, severity: 'major', dimension: 'security', principle: 'Input', title: 'Major late', ...over });

function dims() {
  return [
    { dimension: 'security', fromRunId: 'run-sec', filesRead: 50, principles: [{ name: 'Input', score: 7.7, grade: 'good' }], violations: [
      v({}),
      v({ line: 5, severity: 'critical', title: 'Critical early', context: 'a = 1\n>>> b = input()\nc = 3' }),
    ], compliance: [{ file: 'src/app.py', line: 12, dimension: 'security', principle: 'Guard', title: 'Checked middle' }] },
    { dimension: 'reliability', fromRunId: 'run-rel', violations: [
      v({ line: 20, severity: 'minor', dimension: 'reliability', principle: 'Retry', title: 'Minor other' }),
      v({ file: 'src/other.py', line: 1, dimension: 'reliability', title: 'Elsewhere' }),
    ], compliance: [] },
  ];
}

function renderScope(props = {}) {
  const scope = readScope(props.scope || { kind: 'file', path: 'src/app.py' });
  return render(
    <SidePaneProvider>
      <ScopedFindings dims={dims()} projectName="proj" dateLabel={null} onDismissFinding={vi.fn()} {...props} scope={scope} />
    </SidePaneProvider>,
    { wrapper: withQueryClient() },
  );
}

const rowTitles = (container) => [...container.querySelectorAll('.wb-row__t')].map((n) => n.textContent.replace('✓ ', ''));
const cardTitles = (container) => [...container.querySelectorAll('.findings-card__title, .findings-check__title')].map((n) => n.textContent);
// The header's tiles. Queries stay inside them: the since row may show a random loading tip, and a tip
// can bold the same word as a tile ("On the Map's **Risk** tab"), so a page-wide query would flake.
const headTiles = () => within(document.querySelector('section.findings-head .findings-head__stats'));
const tileValue = (label) => headTiles().getByText(label).closest('.findings-head__stat').querySelector('.findings-head__value');
const segment = (group, name) => within(screen.getByRole('group', { name: group })).getByRole('button', { name: new RegExp(`^${name}`) });
const toCards = () => fireEvent.click(segment(t('violations.scopeViewAria'), t('violations.scopeViewCards')));

describe('ScopedFindings', () => {
  it('heads the page with the scope and its numbers; a file has no per 100 files', () => {
    renderScope();
    expect(screen.getByText('src/app.py')).toBeInTheDocument();
    expect(tileValue(t('violations.scopeStatViolations'))).toHaveTextContent('3');
    expect(tileValue(t('violations.scopeStatPass'))).toHaveTextContent('25%');
    expect(screen.queryByText(t('violations.scopeStatPer100'))).toBeNull();
    expect(headTiles().queryByText(t('violations.scopeStatRisk'))).toBeNull();
  });

  it('opens as the list, its first view, with the first finding in full beside it', () => {
    const { container } = renderScope();
    const views = within(screen.getByRole('group', { name: t('violations.scopeViewAria') })).getAllByRole('button');
    expect(views.map((b) => b.textContent)).toEqual([t('violations.scopeViewList'), t('violations.scopeViewCards')]);
    expect(views[0]).toHaveAttribute('aria-pressed', 'true');
    expect(rowTitles(container)).toEqual(['Critical early', 'Major late', 'Minor other', 'Checked middle']);
    expect(container.querySelector('.wb-detail .wb-headline__title, .wb-detail .findings-card__title')).toHaveTextContent('Critical early');
    fireEvent.click(screen.getByRole('option', { name: /Checked middle/ }));
    expect(container.querySelector('.wb-detail .wb-headline__title, .wb-detail .findings-card__title')).toHaveTextContent('Checked middle');
  });

  it('switches to the cards, every finding with its code closed (the list opens the selected one)', () => {
    const { container } = renderScope();
    expect(container.querySelector('.ctx-line--hl')).not.toBeNull();
    toCards();
    expect(container.querySelector('.findings-scope__split')).toBeNull();
    expect(cardTitles(container)).toEqual(['Critical early', 'Major late', 'Minor other', 'Checked middle']);
    expect(container.querySelector('.ctx-line--hl')).toBeNull();
  });

  it('inside a file the rows read the line only; elsewhere file:line', () => {
    const { container, unmount } = renderScope();
    expect(container.querySelector('.wb-row__f')).toHaveTextContent(t('violations.scopeLine', { line: 5 }));
    unmount();
    const folder = renderScope({ scope: { kind: 'folder', path: 'src' } });
    expect(folder.container.querySelector('.wb-row__f')).toHaveTextContent('app.py:5');
  });

  it('inside a principle the rows leave the principle out, and the header grades it and counts requirements, not per 100', () => {
    const { container } = renderScope({ scope: { kind: 'principle', dimension: 'security', principle: 'Input' } });
    expect([...container.querySelectorAll('.wb-row__sev')].map((n) => n.textContent)).toEqual(['crit', 'maj']);
    expect(container.querySelector('.wb-row__tail')).toBeNull();
    expect(container.querySelector('.findings-head__ring')).toHaveTextContent('7.7');
    expect(container.querySelector('.findings-head__desc')).toHaveTextContent('Validate what comes in');
    expect(tileValue(t('violations.scopeStatReqs'))).toBeInTheDocument();
    expect(screen.queryByText(t('violations.scopeStatPer100'))).toBeNull();
  });

  it('a dimension counts per 100 over the files it read, as the dimension page does', () => {
    renderScope({ scope: { kind: 'dimension', dimension: 'security' } });
    expect(screen.getByText(t('violations.scopeStatFilesRead', { count: 50 }))).toBeInTheDocument();
    expect(tileValue(t('violations.scopeStatPer100'))).toHaveTextContent('4.0');
  });

  it('a folder shows its Risk, too small to judge under three production files', () => {
    renderScope({ scope: { kind: 'folder', path: 'src' } });
    expect(tileValue(t('violations.scopeStatRisk'))).toHaveTextContent(t('map.riskKindSmall'));
    expect(screen.getByText(t('violations.scopeStatFilesHint', { count: 2 }))).toBeInTheDocument();
  });

  it('opens on the scope\'s filter, and the compliant checks are a filter of their own', () => {
    const { container } = renderScope({ scope: { kind: 'file', path: 'src/app.py', filter: 'compliance' } });
    expect(rowTitles(container)).toEqual(['Checked middle']);
    fireEvent.click(segment(t('violations.scopeKindAria'), 'critical'));
    expect(rowTitles(container)).toEqual(['Critical early']);
    fireEvent.click(segment(t('violations.scopeKindAria'), t('violations.scopeKindAll')));
    expect(rowTitles(container)).toHaveLength(4);
  });

  it('reads by severity, compliant last, or down the file by line', () => {
    const { container } = renderScope();
    fireEvent.click(screen.getByRole('button', { name: t('violations.scopeSort_line') }));
    expect(rowTitles(container)).toEqual(['Critical early', 'Checked middle', 'Minor other', 'Major late']);
  });

  it('is read-only without a dismiss handler, and a past day offers no fix plan', () => {
    const { unmount } = renderScope();
    expect(screen.getAllByRole('button', { name: /fix plan/i }).length).toBeGreaterThan(0);
    unmount();
    renderScope({ onDismissFinding: undefined, readOnly: true });
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /fix plan/i })).toBeNull();
  });

  it('dismisses a finding into its own dimension\'s run', () => {
    const onDismissFinding = vi.fn();
    const { container } = renderScope({ onDismissFinding });
    toCards();
    const card = [...container.querySelectorAll('.findings-card')].find((n) => n.textContent.includes('Minor other'));
    fireEvent.click(within(card).getByRole('button', { name: /dismiss/i }));
    expect(onDismissFinding).toHaveBeenCalledWith(expect.objectContaining({ title: 'Minor other' }), 'run-rel');
  });

  it('says so when the scope holds nothing', () => {
    renderScope({ scope: { kind: 'folder', path: 'nowhere' } });
    expect(screen.getByText(t('violations.scopeEmpty'))).toBeInTheDocument();
  });
});
