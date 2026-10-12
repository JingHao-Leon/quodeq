import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import FindingsWorkbench from './FindingsWorkbench.jsx';
import { LIST_CAP } from './FindingList.jsx';
import { flattenFindings } from './workbenchModel.js';
import { makeDims, makeDismissed } from './_workbench.fixtures.js';

vi.mock('./FindingDetail.jsx', () => ({
  default: ({ finding, onOpenFile }) => (
    <div data-testid="detail">{finding?.title || 'none'}{onOpenFile && <button type="button" onClick={() => onOpenFile(finding)}>open</button>}</div>
  ),
}));

function Harness({ initial = null, dims = makeDims(), dismissed = makeDismissed(), dismissedLoading = false, actions = {} }) {
  const [wb, setWb] = useState(initial);
  return <FindingsWorkbench dims={dims} dismissed={dismissed} dismissedLoading={dismissedLoading} workbench={wb} onWorkbenchChange={setWb} actions={actions} />;
}

const manyDims = () => [{ dimension: 'reliability', fromRunId: 'r', violations: Array.from({ length: LIST_CAP * 2 + 10 },
  (_, i) => ({ title: `Finding ${i}`, severity: 'minor', file: `f${i}.py`, line: 1, req: 'R-1' })) }];

describe('FindingsWorkbench', () => {
  it('opens on the open findings, most severe selected', () => {
    render(<Harness />);
    expect(screen.getByText('5 of 6')).toBeInTheDocument();
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
    fireEvent.mouseDown(screen.getByRole('option', { name: /^src\/a\/\s*3$/ }));
    expect(screen.getByText('path: src/a/')).toBeInTheDocument();
    expect(box).toHaveValue('');
    expect(screen.getByText('3 of 6')).toBeInTheDocument();
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
    expect(screen.getByText('1 of 6')).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole('button', { name: 'status' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /all/ }));
    expect(screen.getByRole('button', { name: `show ${LIST_CAP} more` })).toBeInTheDocument();
  });

  it('a selected finding past the row cap is rendered', () => {
    const dims = manyDims();
    const target = flattenFindings(dims, makeDismissed())[LIST_CAP + 5];
    render(<Harness dims={dims} initial={{ selectedId: target.id }} />);
    expect(screen.getByRole('button', { current: true })).toHaveTextContent(target.title);
  });

  it('arrows inside an open filter menu leave the selection alone', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'status' }));
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
});
