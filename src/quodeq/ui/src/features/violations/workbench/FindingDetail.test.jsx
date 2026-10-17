import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import FindingDetail from './FindingDetail.jsx';
import { flattenFindings } from './workbenchModel.js';
import { makeDims, makeDismissed } from './_workbench.fixtures.js';

vi.mock('./useFindingDetail.js', () => ({ useFindingDetail: (f) => (f ? { ...f.raw, reason: 'Because.', confidence: 85, detailDeferred: false } : null) }));
vi.mock('../../explorer/components/EvalCards.jsx', () => ({
  EvalViolationCard: ({ v, onDismiss }) => (
    <div data-testid="card">{v.reason}{onDismiss && <button type="button" onClick={() => onDismiss(v)}>dismiss</button>}</div>
  ),
}));
vi.mock('./DismissRuleMenu.jsx', () => ({ default: () => <span data-testid="rule-menu" /> }));

const dims = makeDims();
const findings = flattenFindings(dims, makeDismissed());
const pick = (title) => findings.find((f) => f.title === title);
const full = { onAddPath: vi.fn(), onOpenFile: vi.fn(), onDismiss: vi.fn(), onDismissType: vi.fn(), onRestore: vi.fn(), onDelete: vi.fn() };

describe('FindingDetail', () => {
  it('shows the finding through the shared card, with file and folder links that add chips', async () => {
    const onAddPath = vi.fn();
    render(<FindingDetail finding={pick('Unchecked return')} dims={dims} findings={findings} actions={full} onAddPath={onAddPath} />);
    expect(screen.getByTestId('card')).toHaveTextContent('Because.');
    await userEvent.click(screen.getByRole('button', { name: 'filter to src/a/b/y.py' }));
    expect(onAddPath).toHaveBeenCalledWith('src/a/b/y.py');
    await userEvent.click(screen.getByRole('button', { name: 'filter to src/a/b/' }));
    expect(onAddPath).toHaveBeenCalledWith('src/a/b/');
  });

  it('dismiss carries the finding with its run, and open file opens it', async () => {
    const onDismiss = vi.fn();
    const onOpenFile = vi.fn();
    const f = pick('Key logged');
    render(<FindingDetail finding={f} dims={dims} findings={findings} onAddPath={full.onAddPath} actions={{ ...full, onDismiss, onOpenFile }} />);
    await userEvent.click(screen.getByRole('button', { name: 'dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith(expect.objectContaining({ req: 'S-CON-2', dimension: 'security' }), 'run-2');
    await userEvent.click(screen.getByRole('button', { name: 'open file ›' }));
    expect(onOpenFile).toHaveBeenCalledWith(f);
  });

  it('a finding without a file has no path or folder link', () => {
    render(<FindingDetail finding={pick('No file at all')} dims={dims} findings={findings} onAddPath={full.onAddPath} actions={full} />);
    expect(screen.queryByRole('button', { name: /^filter to/ })).toBeNull();
  });

  it('a dismissed finding offers restore and delete, not dismiss', async () => {
    const onRestore = vi.fn();
    render(<FindingDetail finding={pick('Old warning')} dims={dims} findings={findings} onAddPath={full.onAddPath} actions={{ ...full, onRestore }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenCalledWith(pick('Old warning').raw);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'dismiss' })).toBeNull();
  });

  it('a shared project shows no mutating control', () => {
    render(<FindingDetail finding={pick('Key logged')} dims={dims} findings={findings} onAddPath={vi.fn()} actions={{ onOpenFile: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: 'dismiss' })).toBeNull();
    expect(screen.queryByTestId('rule-menu')).toBeNull();
  });

  it('confidence reads from the hydrated finding', () => {
    render(<FindingDetail finding={pick('Key logged')} dims={dims} findings={findings} onAddPath={full.onAddPath} actions={full} />);
    expect(screen.getByText('confidence 85%')).toBeInTheDocument();
  });

  it('a finding with no run offers no dismiss-by-rule menu', () => {
    render(<FindingDetail finding={{ ...pick('Key logged'), runId: null }} dims={dims} findings={findings} onAddPath={full.onAddPath} actions={full} />);
    expect(screen.queryByTestId('rule-menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'dismiss' })).toBeInTheDocument();
  });

  it('nothing selected asks for a pick', () => {
    render(<FindingDetail finding={null} dims={dims} findings={findings} onAddPath={full.onAddPath} actions={full} />);
    expect(screen.getByText('pick a finding')).toBeInTheDocument();
  });

  it('without onAddPath the file and folder are plain text', () => {
    render(<FindingDetail finding={pick('Unchecked return')} dims={dims} findings={findings} actions={full} onAddPath={undefined} />);
    expect(screen.queryByRole('button', { name: /^filter to/ })).toBeNull();
    expect(screen.getByText('in src/a/b/')).toBeInTheDocument();
  });
});
