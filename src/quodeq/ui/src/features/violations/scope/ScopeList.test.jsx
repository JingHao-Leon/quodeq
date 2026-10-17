import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ScopeList } from './ScopeList.jsx';
import { LIST_CAP } from '../workbench/FindingList.jsx';
import { SidePaneProvider } from '../../side-pane/index.js';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';
import { t } from '../../../strings/index.js';

vi.mock('../../../utils/pretext.js', async (importOriginal) => ({
  ...(await importOriginal()), measureWidth: () => 0, cssFontFromElement: () => '12px monospace',
}));

const within = { inFile: false, inPrinciple: false };
const row = (i) => ({ kind: 'violation', v: { file: `src/f${i}.py`, line: i, severity: 'major', dimension: 'security', principle: 'P', title: `Finding ${i}` } });
const check = { kind: 'compliance', c: { file: 'src/ok.py', line: 2, principle: 'Guard', title: 'Holds', provenanceDowngrade: false } };

function renderList(rows) {
  return render(<SidePaneProvider><ScopeList rows={rows} within={within} readOnly /></SidePaneProvider>, { wrapper: withQueryClient() });
}
const options = () => screen.getAllByRole('option');
const detailTitle = (container) => container.querySelector('.wb-detail .findings-card__title').textContent;

describe('ScopeList', () => {
  afterEach(() => vi.useRealTimers());

  it('the arrow keys move the selection and focus with it; only the selected row is a tab stop', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    const { container } = renderList([row(1), row(2), check]);
    expect(options().map((o) => o.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    fireEvent.keyDown(screen.getByRole('listbox', { name: t('violations.scopeListAria') }), { key: 'ArrowDown' });
    act(() => { vi.runAllTimers(); });
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(options()[1]);
    expect(detailTitle(container)).toBe('Finding 2');
    fireEvent.keyDown(options()[1], { key: 'ArrowDown' });
    fireEvent.keyDown(options()[2], { key: 'ArrowDown' });
    expect(detailTitle(container)).toBe('Holds');
  });

  it('the decorative check mark of a compliant check is hidden from assistive tech', () => {
    const { container } = renderList([check]);
    expect(container.querySelector('.wb-detail .findings-check__mark')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the rows a cap at a time, as the workbench list does', () => {
    renderList(Array.from({ length: LIST_CAP + 5 }, (_, i) => row(i)));
    expect(options()).toHaveLength(LIST_CAP);
    fireEvent.click(screen.getByRole('button', { name: t('violations.wbShowMore', { count: 5 }) }));
    expect(options()).toHaveLength(LIST_CAP + 5);
  });
});
