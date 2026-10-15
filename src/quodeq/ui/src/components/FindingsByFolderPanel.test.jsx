import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import FindingsByFolderPanel from './FindingsByFolderPanel.jsx';

// The rows under the column header.
const bodyRows = () => screen.getAllByRole('row').slice(1);

const v = (file, severity = 'minor') => ({ file, severity, req: 'X-1', title: 't' });

describe('FindingsByFolderPanel', () => {
  it('shows the shared prefix once and each folder below it', () => {
    const dims = [{ dimension: 'a', violations: [v('src/main/app/Views/A.swift', 'major'), v('src/main/lib/Views/B.swift')] }];
    render(<FindingsByFolderPanel dimensions={dims} />);
    expect(screen.getByText('IN src/main/ · CLICK TO OPEN')).toBeInTheDocument();
    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent('app/Views/');
    expect(rows[1]).toHaveTextContent('lib/Views/');
  });

  it('keeps two folders with the same last names apart', () => {
    const dims = [{ dimension: 'a', violations: [v('x/one/Article/Views/A.swift'), v('y/two/Article/Views/B.swift')] }];
    render(<FindingsByFolderPanel dimensions={dims} />);
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText('2 folders · 2 files with findings')).toBeInTheDocument();
  });

  it('opens a folder with its full path', () => {
    const onFolderClick = vi.fn();
    const dims = [{ dimension: 'a', violations: [v('src/x/a.py'), v('src/y/b.py')] }];
    render(<FindingsByFolderPanel dimensions={dims} onFolderClick={onFolderClick} />);
    fireEvent.click(bodyRows()[0]);
    expect(onFolderClick.mock.calls[0][0].dir.startsWith('src/')).toBe(true);
  });
});

describe('FindingsByFolderPanel, beyond the top folders', () => {
  const many = [{ dimension: 'a', violations: Array.from({ length: 10 }, (_, i) => v(`src/m${i}/f.py`)) }];

  it('shows the top eight, as many rows as Fix first, and hands the rest to the Map', () => {
    const onOpenMap = vi.fn();
    render(<FindingsByFolderPanel dimensions={many} onOpenMap={onOpenMap} />);
    expect(bodyRows()).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: /all folders in Map/ }));
    expect(onOpenMap).toHaveBeenCalled();
  });

  it('has no Map link when every folder already shows', () => {
    const few = [{ dimension: 'a', violations: [v('src/x/a.py'), v('src/y/b.py')] }];
    render(<FindingsByFolderPanel dimensions={few} onOpenMap={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /all folders in Map/ })).not.toBeInTheDocument();
  });
});

describe('FindingsByFolderPanel, a folder in the Map', () => {
  const dims = [{ dimension: 'a', violations: [v('src/api/a.py'), v('src/web/b.py')] }];

  it('a row\'s map icon opens that folder in the Map, not the folder\'s findings', () => {
    const onFolderClick = vi.fn();
    const onFolderInMap = vi.fn();
    render(<FindingsByFolderPanel dimensions={dims} onFolderClick={onFolderClick} onFolderInMap={onFolderInMap} />);
    const icon = screen.getByRole('button', { name: 'Show src/api in the Map' });
    fireEvent.click(icon);
    fireEvent.keyDown(icon, { key: 'Enter' });
    expect(onFolderInMap).toHaveBeenCalledWith(expect.objectContaining({ dir: 'src/api' }));
    expect(onFolderClick).not.toHaveBeenCalled();
  });

  it('has no map icons when the page cannot open the Map', () => {
    render(<FindingsByFolderPanel dimensions={dims} />);
    expect(screen.queryByRole('button', { name: /in the Map$/ })).not.toBeInTheDocument();
  });
});
