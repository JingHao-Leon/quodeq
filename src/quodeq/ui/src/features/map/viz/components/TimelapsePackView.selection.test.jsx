import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { stubPackCanvas } from '../../../../test-utils/packFixture.js';
import TimelapsePackView from './TimelapsePackView.jsx';
import { decodeTimelapse } from '../../model/mapTimelapse.js';
import { t } from '../../../../strings/index.js';

// hitCircle is stubbed to "the circle at `hitPath`", as in TimelapsePackView.test.jsx.
let hitPath = null;
vi.mock('../core/packCanvasGeometry.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    hitCircle: (circles) => {
      const i = circles.findIndex((c) => c.depth > 0 && c.data.path === hitPath);
      return i < 0 ? null : i;
    },
  };
});

const row = (file, violations) => [file, violations, violations, 2, 0, 0, 0, 0];
// Run 0: src/ui holds a.js (2 issues); run 1 adds b.js and gives a.js 3.
const DATA = decodeTimelapse({
  activitySource: 'git', fileNames: ['src/ui/a.js', 'src/ui/b.js', 'docs/c.md'], fileArea: ['x', 'x', 'y'], fileLayer: ['', '', ''],
  frameEncoding: 'delta',
  frames: [
    { day: '2026-09-01', new: 0, fixed: 0, areas: [], files: [row(0, 2), row(2, 1)], gone: [] },
    { day: '2026-09-08', new: 2, fixed: 0, areas: [], files: [row(0, 3), row(1, 1)], gone: [] },
  ],
});
beforeEach(() => { stubPackCanvas(); hitPath = null; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const timelapse = (over = {}) => ({ data: DATA, position: 0, playing: false, speed: 1, moveMs: 0, onSettled: vi.fn(), controls: {}, ...over });
const overlayOf = (container) => container.querySelector('canvas[tabindex="0"]');
/** The value a panel line shows, by its label. */
const lineValue = (labelKey) => screen.getByText(t(labelKey)).nextSibling.textContent;
const closeButton = () => screen.queryByRole('button', { name: t('map.panelClose') });

/** The view with the selection held by path above it, as MapPackPanel shares it with today's pack. */
function Shared({ tl, initial = null, onSelect = () => {} }) {
  const [path, setPath] = useState(initial);
  const select = (p) => { onSelect(p); setPath(p); };
  return (
    <TimelapsePackView timelapse={tl} colorMode="concentration" currentPath="src/ui" onDrillDown={vi.fn()}
      selection={{ path, onSelect: select }} />
  );
}

async function renderShared(props) {
  const view = render(<Shared tl={timelapse()} {...props} />);
  await waitFor(() => expect(overlayOf(view.container)).not.toBeNull());
  await act(async () => {});
  return view;
}

describe('TimelapsePackView: the panel', () => {
  it('with nothing selected it shows the open folder, counting only the files the run holds', async () => {
    await renderShared();
    expect(screen.getByText('ui')).toBeInTheDocument();
    expect(lineValue('map.contents')).toBe('1');
    expect(closeButton()).toBeNull();
  });

  it('never offers View Details: that would open today\'s page for another day', async () => {
    await renderShared({ initial: 'src/ui/a.js' });
    expect(screen.queryByRole('button', { name: t('map.viewDetails') })).toBeNull();
  });
});

describe('TimelapsePackView: selecting a file', () => {
  it('a click on a file of the open folder selects it by path, playing too, and the panel shows that run\'s numbers', async () => {
    const onSelect = vi.fn();
    const { container } = await renderShared({ tl: timelapse({ playing: true }), onSelect });
    hitPath = 'src/ui/a.js';
    fireEvent.click(overlayOf(container));
    expect(onSelect).toHaveBeenCalledWith('src/ui/a.js');
    expect(screen.getByText('a.js')).toBeInTheDocument();
    expect(lineValue('map.violations')).toBe('2');
  });

  it('a selection held above the view shows on mount: today\'s pick survives the hand-over', async () => {
    await renderShared({ initial: 'src/ui/a.js' });
    expect(screen.getByText('a.js')).toBeInTheDocument();
    expect(closeButton()).not.toBeNull();
  });

  it('the close button clears the selection, and the panel goes back to the open folder', async () => {
    const onSelect = vi.fn();
    await renderShared({ initial: 'src/ui/a.js', onSelect });
    fireEvent.click(closeButton());
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(screen.getByText('ui')).toBeInTheDocument();
  });

  it('a click anywhere else clears the selection', async () => {
    const onSelect = vi.fn();
    const { container } = await renderShared({ initial: 'src/ui/a.js', onSelect });
    fireEvent.click(overlayOf(container));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('a selected file the run does not hold leaves the panel on the open folder', async () => {
    await renderShared({ initial: 'src/ui/b.js' });
    expect(screen.queryByText('b.js')).toBeNull();
    expect(closeButton()).toBeNull();
  });
});
