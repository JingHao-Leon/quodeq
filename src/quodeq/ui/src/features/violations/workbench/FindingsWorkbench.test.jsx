import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { t } from '../../../strings/index.js';
import FindingsWorkbench from './FindingsWorkbench.jsx';
import { LIST_CAP } from './FindingList.jsx';
import { flattenFindings } from './workbenchModel.js';
import { makeDims, makeDismissed } from './_workbench.fixtures.js';

vi.mock('./FindingDetail.jsx', () => ({
  default: ({ finding, actions, onAddPath }) => (
    <div data-testid="detail">{finding?.title || 'none'}{actions?.onOpenFile && <button type="button" onClick={() => actions.onOpenFile(finding)}>open</button>}
      <button type="button" onClick={() => onAddPath(finding.file)}>file link</button>
      <button type="button" onClick={() => onAddPath(finding.file.slice(0, finding.file.lastIndexOf('/') + 1))}>folder link</button>
    </div>
  ),
}));

function Harness({ initial = null, dims = makeDims(), dismissed = makeDismissed(), dismissedLoading = false, actions = {} }) {
  const [wb, setWb] = useState(initial);
  return <FindingsWorkbench dims={dims} dismissed={dismissed} dismissedLoading={dismissedLoading} workbench={wb} onWorkbenchChange={setWb} actions={actions} />;
}

const manyDims = () => [{ dimension: 'reliability', fromRunId: 'r', violations: Array.from({ length: LIST_CAP * 2 + 10 },
  (_, i) => ({ title: `Finding ${i}`, severity: 'minor', file: `f${i}.py`, line: 1, req: 'R-1' })) }];

// manyDims() renders 600 rows once the cap is lifted: under 1 s alone, but
// past the 5 s default under the full suite's load on CI.
const MANY_ROWS_TIMEOUT_MS = 20_000;

describe('FindingsWorkbench', () => {
  it('opens on the open findings, most severe selected', () => {
    render(<Harness />);
    expect(screen.getByText('5 of 5')).toBeInTheDocument();
    expect(screen.getByTestId('detail')).toHaveTextContent('Swallowed error');
  });

  it('↓ and ↑ move the selection; typing in the search does not', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByTestId('detail')).not.toHaveTextContent('Swallowed error');
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(screen.getByTestId('detail')).toHaveTextContent('Swallowed error');
    const box = screen.getByRole('textbox', { name: 'Search findings' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(screen.getByTestId('detail')).toHaveTextContent('Swallowed error');
  });

  it('/ focuses the search', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: '/' });
    expect(screen.getByRole('textbox', { name: 'Search findings' })).toHaveFocus();
  });

  it('picking a suggested path adds its chip and clears the search in one change', () => {
    render(<Harness />);
    const box = screen.getByRole('textbox', { name: 'Search findings' });
    fireEvent.change(box, { target: { value: 'src/a' } });
    fireEvent.click(screen.getByRole('option', { name: /^src\/a\/\s*3$/ }));
    expect(screen.getByText('path: src/a/')).toBeInTheDocument();
    expect(box).toHaveValue('');
    expect(screen.getByText('3 of 5')).toBeInTheDocument();
  });

  it('a selection the filters hide falls back to the first visible finding', () => {
    render(<Harness initial={{ q: 'key', selectedId: 'gone' }} />);
    expect(screen.getByTestId('detail')).toHaveTextContent('Key logged');
  });

  it('folders: going into src/ skips to the first level with a choice', async () => {
    render(<Harness initial={{ group: 'folders' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open folder src/' }));
    expect(screen.getByText('path: src/')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open folder src/a/' })).toBeInTheDocument();
  });

  it('status dismissed lists only the dismissed one', () => {
    render(<Harness initial={{ status: 'dismissed' }} />);
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    expect(screen.getByTestId('detail')).toHaveTextContent('Old warning');
  });

  it('open file is offered only for a finding the page can open', () => {
    const onOpenFile = vi.fn();
    const canOpenFile = (f) => f.title !== 'Swallowed error';
    render(<Harness actions={{ onOpenFile, canOpenFile }} />);
    expect(screen.queryByRole('button', { name: 'open' })).toBeNull();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(onOpenFile).toHaveBeenCalledWith(expect.objectContaining({ file: 'src/a/x.py' }));
  });

  it('the row cap starts over when a filter changes, not while typing', async () => {
    render(<Harness dims={manyDims()} />);
    fireEvent.click(screen.getByRole('button', { name: `show ${LIST_CAP} more` }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search findings' }), { target: { value: 'finding' } });
    expect(screen.getByRole('button', { name: 'show 10 more' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^status/ }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /all/ }));
    expect(screen.getByRole('button', { name: `show ${LIST_CAP} more` })).toBeInTheDocument();
  }, MANY_ROWS_TIMEOUT_MS);

  it('a selected finding past the row cap is rendered', () => {
    const dims = manyDims();
    const target = flattenFindings(dims, makeDismissed())[LIST_CAP + 5];
    render(<Harness dims={dims} initial={{ selectedId: target.id }} />);
    expect(screen.getByRole('button', { current: true })).toHaveTextContent(target.title);
  });

  it('arrows inside an open filter menu leave the selection alone', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /^status/ }));
    fireEvent.keyDown(screen.getAllByRole('menuitemradio')[0], { key: 'ArrowDown' });
    expect(screen.getByTestId('detail')).toHaveTextContent('Swallowed error');
  });

  it('an arrow another handler already took leaves the selection alone', () => {
    render(<Harness />);
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    e.preventDefault();
    fireEvent(window, e);
    expect(screen.getByTestId('detail')).toHaveTextContent('Swallowed error');
  });

  it('while the dismissed list first loads, status dismissed shows the list skeleton', () => {
    const { container } = render(<Harness initial={{ status: 'dismissed' }} dismissed={[]} dismissedLoading />);
    expect(container.querySelector('.card-list-skeleton')).not.toBeNull();
    expect(screen.queryByText('no finding matches these filters')).toBeNull();
  });

  it('dismissing the selected finding moves the selection to its neighbour and removes it from the open list', () => {
    const { rerender } = render(<Harness />);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByTestId('detail')).toHaveTextContent('Missing null guard');
    const record = { title: 'Missing null guard', severity: 'major', file: 'src/a/x.py', line: 10, req: 'R-FT-2', dimension: 'reliability' };
    rerender(<Harness dismissed={[...makeDismissed(), record]} />);
    expect(screen.queryByRole('button', { name: /Missing null guard/ })).toBeNull();
    expect(screen.getByTestId('detail')).toHaveTextContent('No file at all');
    expect(screen.getByText('4 of 4')).toBeInTheDocument();
  });

  it('outside folders, the detail links add path chips', () => {
    render(<Harness initial={{ q: 'key' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'file link' }));
    fireEvent.click(screen.getByRole('button', { name: 'folder link' }));
    expect(screen.getByText('path: src/a/x.py')).toBeInTheDocument();
    expect(screen.getByText('path: src/a/')).toBeInTheDocument();
  });

  it('in folders, the detail links move to the finding\'s folder and never add a second chip', () => {
    render(<Harness initial={{ group: 'folders', paths: ['src/a/', 'src/c/z.js'] }} />);
    expect(screen.getByTestId('detail')).toHaveTextContent('Key logged');
    fireEvent.click(screen.getByRole('button', { name: 'folder link' }));
    expect(screen.queryByText('path: src/c/z.js')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'file link' }));
    expect(screen.getAllByRole('button', { name: /^Remove / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Remove src/a/']);
    expect(screen.getByTestId('detail')).toHaveTextContent('Key logged');
  });

  it('bulk restore and delete wait behind a ⋯, name the whole project and show only when nothing narrows the list', () => {
    const actions = { onRestoreAll: vi.fn(), onDeleteAll: vi.fn() };
    const two = [...makeDismissed(), { ...makeDismissed()[0], title: 'Older', line: 9 }];
    const { unmount } = render(<Harness initial={{ status: 'dismissed' }} dismissed={two} actions={actions} />);
    expect(screen.queryByRole('button', { name: /delete all/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('violations.wbDismissedMore') }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'delete all 2 in project' }));
    expect(actions.onDeleteAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    unmount();
    render(<Harness initial={{ status: 'dismissed', q: 'old' }} dismissed={two} actions={actions} />);
    expect(screen.queryByRole('button', { name: t('violations.wbDismissedMore') })).toBeNull();
  });

  it('a severity, dimension, path or area filter hides the bulk actions too', () => {
    const two = [...makeDismissed(), { ...makeDismissed()[0], title: 'Older', line: 9 }];
    const actions = { onRestoreAll: vi.fn(), onDeleteAll: vi.fn() };
    const area = { name: 'legacy', paths: ['src/c/'] };
    [{ severity: 'minor' }, { dimension: 'maintainability' }, { paths: ['src/c/'] }, { area }].forEach((narrow) => {
      const { unmount } = render(<Harness initial={{ status: 'dismissed', ...narrow }} dismissed={two} actions={actions} />);
      expect(screen.queryByRole('button', { name: t('violations.wbDismissedMore') })).toBeNull();
      unmount();
    });
  });

  it('opened from a Map area, the list holds only that area\'s findings until its chip is removed', async () => {
    render(<Harness initial={{ area: { name: 'checkout', paths: ['src/a/b/', 'src/c/z.js'] } }} />);
    expect(screen.getByText('2 of 5')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove the checkout area' }));
    expect(screen.getByText('5 of 5')).toBeInTheDocument();
  });

  it('open file writes a pending selection to the nav entry before it leaves', () => {
    const onWorkbenchChange = vi.fn();
    const onOpenFile = vi.fn();
    render(<FindingsWorkbench dims={makeDims()} dismissed={[]} workbench={null} onWorkbenchChange={onWorkbenchChange} actions={{ onOpenFile }} />);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(onWorkbenchChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(onWorkbenchChange).toHaveBeenCalledWith(expect.objectContaining({ selectedId: expect.stringContaining('Key logged') }));
    expect(onWorkbenchChange.mock.invocationCallOrder[0]).toBeLessThan(onOpenFile.mock.invocationCallOrder[0]);
  });
});
