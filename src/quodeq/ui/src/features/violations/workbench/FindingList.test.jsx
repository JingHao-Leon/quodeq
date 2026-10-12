import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import FindingList from './FindingList.jsx';
import { sevAbbr } from './sevWords.js';
import { SEVERITY } from '../../../vocab/severity.js';
import { flattenFindings, groupFindings } from './workbenchModel.js';
import { folderLevel } from './folderModel.js';
import { FINDING_GROUP } from '../violationsVocab.js';
import { makeDims, makeDismissed } from './_workbench.fixtures.js';

const findings = flattenFindings(makeDims(), makeDismissed());
const base = { selectedId: null, onSelect: vi.fn(), shown: findings.length, total: findings.length, browse: null, lineOnly: false };

describe('FindingList', () => {
  it('lists every finding as a button named by its title, severity on the edge', () => {
    render(<FindingList {...base} groups={groupFindings(findings, FINDING_GROUP.NONE)} />);
    const row = screen.getByRole('button', { name: /Swallowed error/ });
    expect(row).toHaveClass('wb-row--critical');
    expect(screen.getByRole('button', { name: /Old warning/ })).toHaveClass('is-dismissed');
  });

  it('clicking a row selects it', async () => {
    const onSelect = vi.fn();
    render(<FindingList {...base} onSelect={onSelect} groups={groupFindings(findings, FINDING_GROUP.NONE)} />);
    await userEvent.click(screen.getByRole('button', { name: /Key logged/ }));
    expect(onSelect).toHaveBeenCalledWith(findings.find((f) => f.title === 'Key logged').id);
  });

  it('grouped by file, headers carry the file and rows only the line', () => {
    render(<FindingList {...base} lineOnly groups={groupFindings(findings, FINDING_GROUP.FILE)} />);
    expect(screen.getByText('src/a/x.py')).toBeInTheDocument();
    expect(screen.getAllByText(':10').length).toBe(1);
  });

  it('folders: breadcrumb and folder rows; a folder click goes in, root goes back', async () => {
    const onDir = vi.fn();
    const lvl = folderLevel(findings, 'src/');
    render(<FindingList {...base} lineOnly groups={lvl.files} browse={{ dir: 'src/', folders: lvl.folders, onDir }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open folder src/a/' }));
    expect(onDir).toHaveBeenCalledWith('src/a/');
    await userEvent.click(screen.getByRole('button', { name: 'root' }));
    expect(onDir).toHaveBeenCalledWith('');
  });

  it('caps at 300 rows and shows more on request', async () => {
    const many = Array.from({ length: 450 }, (_, i) => ({ ...findings[0], id: `f${i}`, title: `T${i}` }));
    render(<FindingList {...base} shown={450} groups={[{ key: null, items: many }]} />);
    expect(screen.getAllByRole('button', { name: /^T\d+/ })).toHaveLength(300);
    await userEvent.click(screen.getByRole('button', { name: 'show 150 more' }));
    expect(screen.getAllByRole('button', { name: /^T\d+/ })).toHaveLength(450);
  });

  it('says so when nothing matches', () => {
    render(<FindingList {...base} shown={0} groups={[{ key: null, items: [] }]} />);
    expect(screen.getByText('no finding matches these filters')).toBeInTheDocument();
  });

  it('an empty group key gets a visible label, a null key no header', () => {
    render(<FindingList {...base} groups={[{ key: '', items: [findings[0]] }]} />);
    expect(screen.getByText('(none)')).toBeInTheDocument();
  });

  it('sevAbbr maps severities to short words, unknown to empty', () => {
    expect(sevAbbr(SEVERITY.CRITICAL)).toBe('crit');
    expect(sevAbbr(SEVERITY.MAJOR)).toBe('maj');
    expect(sevAbbr(SEVERITY.MINOR)).toBe('min');
    expect(sevAbbr('nope')).toBe('');
  });
});
