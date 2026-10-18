import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import FindingDetail from './FindingDetail.jsx';
import { flattenFindings } from './workbenchModel.js';
import { makeDims, makeDismissed } from './_workbench.fixtures.js';

vi.mock('./useFindingDetail.js', () => ({ useFindingDetail: (f) => (f ? { ...f.raw, reason: 'Because.', confidence: 85, detailDeferred: false } : null) }));
vi.mock('./useRequirementText.js', () => ({ useRequirementText: (dim, req) => (req === 'S-CON-2' ? 'Secrets MUST NOT be logged' : '') }));
vi.mock('./FixPlanButton.jsx', () => ({ default: () => <button type="button">fix plan</button> }));

const dims = makeDims();
const findings = flattenFindings(dims, makeDismissed());
const pick = (title) => findings.find((f) => f.title === title);
const full = { onAddPath: vi.fn(), onOpenFile: vi.fn(), onDismiss: vi.fn(), onDismissType: vi.fn(), onRestore: vi.fn(), onDelete: vi.fn() };

describe('FindingDetail', () => {
  it('leads with severity and title, then why and the rule with what the standard asks', () => {
    render(<FindingDetail finding={pick('Key logged')} dims={dims} findings={findings} actions={full} onAddPath={full.onAddPath} />);
    expect(screen.getByRole('heading', { name: 'Key logged' })).toBeInTheDocument();
    expect(screen.getByText('WHY')).toBeInTheDocument();
    expect(screen.getByText('Because.')).toBeInTheDocument();
    expect(screen.getByText('RULE')).toBeInTheDocument();
    expect(screen.getByText('S-CON-2')).toBeInTheDocument();
    expect(screen.getByText('Secrets MUST NOT be logged')).toBeInTheDocument();
  });

  it('file and folder links add chips', async () => {
    const onAddPath = vi.fn();
    render(<FindingDetail finding={pick('Unchecked return')} dims={dims} findings={findings} actions={full} onAddPath={onAddPath} />);
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
    await userEvent.click(screen.getByRole('button', { name: 'dismiss this finding or all S-CON-2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Dismiss this finding' }));
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
    expect(screen.queryByRole('button', { name: /^dismiss/ })).toBeNull();
  });

  it('the dismiss menu also offers the rule in the project', async () => {
    const onDismissType = vi.fn();
    render(<FindingDetail finding={pick('Key logged')} dims={dims} findings={findings} onAddPath={full.onAddPath} actions={{ ...full, onDismissType }} />);
    await userEvent.click(screen.getByRole('button', { name: 'dismiss this finding or all S-CON-2' }));
    await userEvent.click(screen.getByRole('menuitem', { name: /in this project/ }));
    expect(onDismissType).toHaveBeenCalledWith(expect.objectContaining({ req: 'S-CON-2' }), 'project');
  });

  it('a past day (read-only) has no fix plan', () => {
    render(<FindingDetail finding={pick('Key logged')} dims={dims} findings={findings} onAddPath={full.onAddPath} actions={{ ...full, readOnly: true }} />);
    expect(screen.queryByRole('button', { name: 'fix plan' })).toBeNull();
  });

  it('a shared project shows no mutating control', () => {
    render(<FindingDetail finding={pick('Key logged')} dims={dims} findings={findings} onAddPath={vi.fn()} actions={{ onOpenFile: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: /^dismiss/ })).toBeNull();
  });

  it('confidence reads from the hydrated finding', () => {
    render(<FindingDetail finding={pick('Key logged')} dims={dims} findings={findings} onAddPath={full.onAddPath} actions={full} />);
    expect(screen.getByText('confidence 85%')).toBeInTheDocument();
  });

  it('a finding with no run offers no dismiss-by-rule menu', () => {
    render(<FindingDetail finding={{ ...pick('Key logged'), runId: null }} dims={dims} findings={findings} onAddPath={full.onAddPath} actions={full} />);
    expect(screen.queryByRole('button', { name: /or all/ })).toBeNull();
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
