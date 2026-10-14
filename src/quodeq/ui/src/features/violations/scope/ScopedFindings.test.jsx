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

const v = (over) => ({ file: 'src/app.py', line: 30, severity: 'major', dimension: 'security', principle: 'Input', title: 'Major late', ...over });

function dims() {
  return [
    { dimension: 'security', fromRunId: 'run-sec', violations: [
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
      <ScopedFindings scope={scope} dims={dims()} projectName="proj" dateLabel={null} onDismissFinding={vi.fn()} {...props} scope={scope} />
    </SidePaneProvider>,
    { wrapper: withQueryClient() },
  );
}

const statValue = (label) => screen.getByText(label).closest('.term-stat').querySelector('.term-stat__value');
const titles = (container) => [...container.querySelectorAll('.vlive-detail-title')].map((n) => n.textContent);
const pill = (name) => screen.getAllByRole('button').find((b) => b.querySelector('.term-flag-pill__name')?.textContent === name);

describe('ScopedFindings', () => {
  it('heads the page with the scope and its numbers', () => {
    renderScope();
    expect(screen.getByText('src/app.py')).toBeInTheDocument();
    expect(statValue(t('overview.statViolations'))).toHaveTextContent('3');
    expect(statValue(t('overview.statCompliance'))).toHaveTextContent('1');
    expect(statValue(t('explorer.dimensionsStat'))).toHaveTextContent('2');
  });

  it('opens on the scope\'s filter, and the compliant checks are a filter of their own', () => {
    const { container } = renderScope({ scope: { kind: 'file', path: 'src/app.py', filter: 'compliance' } });
    expect(titles(container)).toEqual(['Checked middle']);
    fireEvent.click(pill('critical'));
    expect(titles(container)).toEqual(['Critical early']);
    fireEvent.click(pill('all'));
    expect(titles(container)).toHaveLength(4);
  });

  it('reads by severity, compliant last, or down the file by line', () => {
    const { container } = renderScope();
    expect(titles(container)).toEqual(['Critical early', 'Major late', 'Minor other', 'Checked middle']);
    fireEvent.click(screen.getByRole('button', { name: t('violations.scopeSort_line') }));
    expect(titles(container)).toEqual(['Critical early', 'Checked middle', 'Minor other', 'Major late']);
  });

  it('hands the scope to the workbench list', () => {
    const onList = vi.fn();
    renderScope({ onList });
    fireEvent.click(screen.getByRole('button', { name: t('violations.scopeAsList') }));
    expect(onList).toHaveBeenCalledTimes(1);
  });

  it('is read-only without a dismiss handler', () => {
    renderScope({ onDismissFinding: undefined });
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('a past day offers no fix plan, a day of today does', () => {
    const { unmount } = renderScope();
    expect(screen.getAllByRole('button', { name: /fix plan/i }).length).toBeGreaterThan(0);
    unmount();
    renderScope({ onDismissFinding: undefined, readOnly: true });
    expect(screen.queryByRole('button', { name: /fix plan/i })).toBeNull();
  });

  it('dismisses a finding into its own dimension\'s run', () => {
    const onDismissFinding = vi.fn();
    const { container } = renderScope({ onDismissFinding });
    const card = [...container.querySelectorAll('.vdetail-row')].find((n) => n.textContent.includes('Minor other'));
    fireEvent.click(within(card).getByRole('button', { name: /dismiss/i }));
    expect(onDismissFinding).toHaveBeenCalledWith(expect.objectContaining({ title: 'Minor other' }), 'run-rel');
  });

  it('shows the code of each finding open', () => {
    const { container } = renderScope();
    expect(container.querySelector('.ctx-line--hl')).not.toBeNull();
  });

  it('says so when the scope holds nothing', () => {
    renderScope({ scope: { kind: 'folder', path: 'nowhere' } });
    expect(screen.getByText(t('violations.scopeEmpty'))).toBeInTheDocument();
  });
});
