import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import FindingsWorkbench from './FindingsWorkbench.jsx';
import { LIST_CAP } from './FindingList.jsx';
import { makeDims, makeDismissed } from './_workbench.fixtures.js';

vi.mock('./FindingDetail.jsx', () => ({
  default: ({ finding, onOpenFile }) => (
    <div data-testid="detail">{finding?.title || 'none'}{onOpenFile && <button type="button" onClick={() => onOpenFile(finding)}>open</button>}</div>
  ),
}));

function Harness({ initial = null, dims = makeDims(), actions = {} }) {
  const [wb, setWb] = useState(initial);
  return <FindingsWorkbench dims={dims} dismissed={makeDismissed()} workbench={wb} onWorkbenchChange={setWb} actions={actions} />;
}

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

  it('the row cap starts over when the filters change', () => {
    const many = Array.from({ length: LIST_CAP * 2 + 10 }, (_, i) => ({ title: `Finding ${i}`, severity: 'minor', file: `f${i}.py`, line: 1, req: 'R-1' }));
    render(<Harness dims={[{ dimension: 'reliability', fromRunId: 'r', violations: many }]} />);
    fireEvent.click(screen.getByRole('button', { name: `show ${LIST_CAP} more` }));
    expect(screen.getByRole('button', { name: 'show 10 more' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search findings' }), { target: { value: 'finding' } });
    expect(screen.getByRole('button', { name: `show ${LIST_CAP} more` })).toBeInTheDocument();
  });
});
