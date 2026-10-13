import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { stubPackCanvas } from '../../../../test-utils/packFixture.js';
import TimelapsePackView from './TimelapsePackView.jsx';
import { timelapseNoteText } from './timelapseNote.js';
import { decodeTimelapse } from '../../model/mapTimelapse.js';
import { ABSENCE } from '../core/timelapseScene.js';
import { GHOST_DASH_PX } from '../core/packLayers.js';
import { createTimelapseLayouts } from '../core/timelapseLayouts.js';
import { dayDate } from '../core/timelapseBarModel.js';
import { formatShortDate } from '../../../../utils/formatters.js';
import { t } from '../../../../strings/index.js';

// hitCircle is stubbed to "the circle at `hitPath`" so each test names what
// the cursor is over instead of computing pixel positions.
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
vi.mock('../core/timelapseLayouts.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, createTimelapseLayouts: vi.fn(real.createTimelapseLayouts) };
});

const row = (file, violations) => [file, violations, violations, 2, 0, 0, 0, 0];
const FILES = { fileNames: ['src/ui/a.js', 'src/ui/b.js', 'docs/c.md'], fileArea: ['x', 'x', 'y'], fileLayer: ['', '', ''] };
const DATA = decodeTimelapse({
  activitySource: 'git', ...FILES,
  frameEncoding: 'delta',
  frames: [
    { day: '2026-09-01', new: 0, fixed: 0, areas: [], files: [row(0, 2), row(2, 1)], gone: [] },
    { day: '2026-09-08', new: 1, fixed: 0, areas: [], files: [row(1, 1)], gone: [] },
  ],
});
const DATA3 = decodeTimelapse({
  activitySource: 'git', ...FILES,
  frameEncoding: 'delta',
  frames: [
    { day: '2026-09-01', new: 0, fixed: 0, areas: [], files: [row(0, 2), row(2, 1)], gone: [] },
    { day: '2026-09-08', new: 0, fixed: 0, areas: [], files: [row(0, 1)], gone: [] },
    { day: '2026-09-15', new: 0, fixed: 1, areas: [], files: [row(0, 3)], gone: [] },
  ],
});
let ctx;
beforeEach(() => { ctx = stubPackCanvas(); hitPath = null; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

const timelapse = (over = {}) => ({
  data: DATA, position: 0, playing: false, speed: 1, moveMs: 0, onSettled: vi.fn(),
  controls: { pause: vi.fn(), toggle: vi.fn() }, ...over,
});
const overlayOf = (container) => container.querySelector('canvas[tabindex="0"]');
const shortDate = (day) => formatShortDate(dayDate(day).toISOString());
const ghostStrokes = () => ctx.setLineDash.mock.calls.filter(([dash]) => dash.length > 0).length;

// No Worker in jsdom: the layouts are computed on this thread, a few promise turns after the first render.
async function renderView(props) {
  const view = render(<TimelapsePackView colorMode="concentration" currentPath="src/ui" onDrillDown={vi.fn()} {...props} />);
  await waitFor(() => expect(overlayOf(view.container)).not.toBeNull());
  // The palette is read after the canvases mount; let that paint land.
  await act(async () => {});
  return view;
}

describe('TimelapsePackView', () => {
  it('draws the run and tells the playback it settled', async () => {
    const tl = timelapse();
    const { container } = await renderView({ timelapse: tl });
    expect(overlayOf(container)).toHaveAttribute('aria-label', t('map.timelapsePackAria', { date: shortDate('2026-09-01') }));
    expect(tl.onSettled).toHaveBeenCalledWith(0);
    expect(ctx.setLineDash).toHaveBeenCalledWith([GHOST_DASH_PX, GHOST_DASH_PX]);
  });

  it('a click while playing pauses', async () => {
    const tl = timelapse({ playing: true });
    const { container } = await renderView({ timelapse: tl });
    fireEvent.click(overlayOf(container));
    expect(tl.controls.pause).toHaveBeenCalled();
  });

  it('Escape zooms out of the folder shown (src/ui is one collapsed folder, so out is the root)', async () => {
    const onDrillDown = vi.fn();
    const { container } = await renderView({ timelapse: timelapse(), onDrillDown });
    fireEvent.keyDown(overlayOf(container), { key: 'Escape' });
    expect(onDrillDown).toHaveBeenCalledWith('');
  });

  it('an absent circle explains itself', () => {
    expect(timelapseNoteText({ kind: ABSENCE.GONE_SINCE, day: '2026-09-08' })).toBe(t('map.timelapseGoneSince', { date: shortDate('2026-09-08') }));
    expect(timelapseNoteText({ kind: ABSENCE.FIRST_APPEARS, day: '2026-09-08' })).toBe(t('map.timelapseFirstAppears', { date: shortDate('2026-09-08') }));
    expect(timelapseNoteText(null)).toBeNull();
  });
});

describe('TimelapsePackView while paused', () => {
  it('hovering a dotted file says when it first appears, without redrawing the circles', async () => {
    const { container } = await renderView({ timelapse: timelapse() });
    const before = ghostStrokes();
    hitPath = 'src/ui/b.js';
    fireEvent.mouseMove(overlayOf(container));
    expect(container.querySelector('.map-tooltip')).toHaveTextContent(t('map.timelapseFirstAppears', { date: shortDate('2026-09-08') }));
    expect(overlayOf(container).style.cursor).toBe('pointer');
    expect(ghostStrokes()).toBe(before);
  });

  it('hovering a present file shows that run\'s numbers', async () => {
    const { container } = await renderView({ timelapse: timelapse() });
    hitPath = 'src/ui/a.js';
    fireEvent.mouseMove(overlayOf(container));
    expect(container.querySelector('.map-tooltip-title')).toHaveTextContent(/^src\/ui\/a\.js$/);
    expect(container.querySelector('.map-tooltip')).toHaveTextContent(t('map.violations'));
  });

  it('a folder click zooms into it and a file click does nothing', async () => {
    const onDrillDown = vi.fn();
    const { container } = await renderView({ timelapse: timelapse(), onDrillDown, currentPath: '' });
    hitPath = 'src/ui/a.js';
    fireEvent.click(overlayOf(container));
    expect(onDrillDown).not.toHaveBeenCalled();
    hitPath = 'docs';
    fireEvent.click(overlayOf(container));
    expect(onDrillDown).toHaveBeenCalledWith('docs');
  });
});

describe('TimelapsePackView background click', () => {
  it('a click outside every circle while paused zooms out', async () => {
    const onDrillDown = vi.fn();
    const { container } = await renderView({ timelapse: timelapse(), onDrillDown });
    fireEvent.click(overlayOf(container));
    expect(onDrillDown).toHaveBeenCalledWith('');
  });
});

describe('TimelapsePackView while playing', () => {
  it('a pause does not bring back the circle hovered before play', async () => {
    const tl = timelapse();
    const props = { colorMode: 'concentration', currentPath: 'src/ui', onDrillDown: vi.fn() };
    const { container, rerender } = await renderView({ ...props, timelapse: tl });
    hitPath = 'src/ui/a.js';
    fireEvent.mouseMove(overlayOf(container));
    rerender(<TimelapsePackView {...props} timelapse={{ ...tl, playing: true }} />);
    rerender(<TimelapsePackView {...props} timelapse={tl} />);
    expect(container.querySelector('.map-tooltip')).toBeNull();
    expect(overlayOf(container).style.cursor).toBe('default');
  });

  it('shows no hover and no tooltip', async () => {
    const { container } = await renderView({ timelapse: timelapse({ playing: true }) });
    hitPath = 'src/ui/a.js';
    fireEvent.mouseMove(overlayOf(container));
    expect(container.querySelector('.map-tooltip')).toBeNull();
    expect(overlayOf(container).style.cursor).toBe('default');
  });
});

describe('TimelapsePackView across runs', () => {
  it('a seek spanning more than one run cross-fades the two runs', async () => {
    const tl = timelapse({ data: DATA3, moveMs: 900 });
    const { container, rerender } = await renderView({ timelapse: tl });
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    rerender(<TimelapsePackView colorMode="concentration" currentPath="src/ui" onDrillDown={vi.fn()} timelapse={{ ...tl, position: 2 }} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(450); });
    const [back, front] = [...container.querySelectorAll('canvas')].slice(0, 2).map((c) => Number(c.style.opacity));
    expect(front).toBeGreaterThan(0);
    expect(front).toBeLessThan(1);
    expect(back).toBeCloseTo(1 - front);
  });

  it('another history replaces the old one, settled on its own run', async () => {
    const tl = timelapse({ moveMs: 900 });
    const props = { colorMode: 'concentration', currentPath: 'src/ui', onDrillDown: vi.fn() };
    const { container, rerender } = await renderView({ ...props, timelapse: tl });
    rerender(<TimelapsePackView {...props} timelapse={{ ...tl, data: DATA3, position: 2 }} />);
    await waitFor(() => expect(tl.onSettled).toHaveBeenCalledWith(2));
    expect(overlayOf(container)).toHaveAttribute('aria-label', t('map.timelapsePackAria', { date: shortDate('2026-09-15') }));
  });

  it('keeps its layouts when the playback goes to the latest run and back (no rebuild on a second seek)', async () => {
    createTimelapseLayouts.mockClear();
    const tl = timelapse({ data: DATA3 });
    const props = { colorMode: 'concentration', currentPath: 'src/ui', onDrillDown: vi.fn() };
    const { rerender } = await renderView({ ...props, timelapse: tl });
    rerender(<TimelapsePackView {...props} timelapse={{ ...tl, position: 2 }} />);
    rerender(<TimelapsePackView {...props} timelapse={{ ...tl, position: 1 }} />);
    await waitFor(() => expect(tl.onSettled).toHaveBeenCalledWith(1));
    expect(createTimelapseLayouts).toHaveBeenCalledTimes(1);
  });
});
