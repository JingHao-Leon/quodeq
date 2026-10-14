import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { packTree, stubPackCanvas } from '../../../../test-utils/packFixture.js';
import ZoomablePackView from './ZoomablePackView.jsx';
import { t } from '../../../../strings/index.js';

beforeEach(() => { stubPackCanvas(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// Activity labels are deterministic: they read the edit count.
const EDITS = new Map([['src/a.py', 2], ['src/ui/b.js', 1], ['docs/c.md', 1]]);
const pickB = () => fireEvent.keyDown(screen.getByRole('button', { name: 'b.js, changed once' }), { key: 'Enter' });
const closeButton = () => screen.queryByRole('button', { name: t('map.panelClose') });

/** The pack with the selection held by path above it, as MapPackPanel shares it with the time-lapse. */
function Shared({ initial = null, onSelect = () => {}, selection = true }) {
  const [path, setPath] = useState(initial);
  const select = (p) => { onSelect(p); setPath(p); };
  return (
    <ZoomablePackView node={packTree()} colorMode="activity" editsByPath={EDITS} currentPath="src/ui"
      onDrillDown={vi.fn()} onFileClick={vi.fn()} selection={selection ? { path, onSelect: select } : undefined} />
  );
}

describe('ZoomablePackView: the selected file', () => {
  it('a pick goes to the page\'s selection by path', () => {
    const onSelect = vi.fn();
    render(<Shared onSelect={onSelect} />);
    pickB();
    expect(onSelect).toHaveBeenCalledWith('src/ui/b.js');
    expect(screen.getByText('b.js')).toBeInTheDocument();
  });

  it('a path the page holds is selected on mount: a pick made in the time-lapse survives the hand-over', () => {
    render(<Shared initial="src/ui/b.js" />);
    expect(screen.getByText('b.js')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('map.viewDetails') })).toBeInTheDocument();
  });

  it('the panel\'s close button clears the pick and goes back to the open folder', () => {
    const onSelect = vi.fn();
    render(<Shared initial="src/ui/b.js" onSelect={onSelect} />);
    fireEvent.click(closeButton());
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(screen.queryByText('b.js')).toBeNull();
    expect(closeButton()).toBeNull();
  });

  it('without a page selection the pick is held by the view, and closes the same way', () => {
    render(<Shared selection={false} />);
    pickB();
    expect(screen.getByText('b.js')).toBeInTheDocument();
    fireEvent.click(closeButton());
    expect(screen.queryByText('b.js')).toBeNull();
  });

  it('the open folder alone has no close button', () => {
    render(<Shared />);
    expect(closeButton()).toBeNull();
  });
});
