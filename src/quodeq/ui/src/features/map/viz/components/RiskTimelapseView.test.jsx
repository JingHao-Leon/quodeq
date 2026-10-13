import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { stubPackCanvas } from '../../../../test-utils/packFixture.js';
import RiskTimelapseView from './RiskTimelapseView.jsx';
import { decodeTimelapse } from '../../model/mapTimelapse.js';
import { GHOST_DASH_PX } from '../core/packLayers.js';
import { createSkyTimeline } from '../core/skyTimeline.js';
import { skyFrame } from '../core/skyLayers.js';
import { skyRings } from '../core/skyLayout.js';
import { TAU } from '../core/galaxyCore.js';
import { t } from '../../../../strings/index.js';
import { DEFAULT_CANVAS_W, DEFAULT_CANVAS_H } from '../core/galaxyTunables.js';
import { areaSetAt } from '../../model/mapAreas.js';
import { timelapseNoteText } from './timelapseNote.js';
import { ABSENCE } from '../core/timelapseScene.js';

const PATHS = ['app/a.py', 'app/b.py', 'app/c.py', 'app/d.py', 'app/e.py', 'lib/f.py', 'lib/g.py', 'lib/h.py', 'lib/i.py', 'lib/j.py'];
const row = (i) => [i, 1, 1, 1, 0, 0, 0, 0];
const metrics = (area, density = 0) => ({ area, kind: 'watch', density, touchedShare: 0 });
const history = (frames) => decodeTimelapse({
  activitySource: 'git', fileNames: PATHS, fileArea: PATHS.map((p) => p.split('/')[0]), fileLayer: PATHS.map(() => ''), frameEncoding: 'delta', frames,
});
const DATA = history([
  { day: '2026-09-01', new: 0, fixed: 0, areas: [metrics('app')], files: [0, 1, 2, 3, 4].map(row), gone: [] },
  { day: '2026-09-08', new: 5, fixed: 0, areas: [metrics('app'), metrics('lib')], files: [5, 6, 7, 8, 9].map(row), gone: [] },
]);
let ctx;
beforeEach(() => { ctx = stubPackCanvas(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const FRAME = skyFrame(DEFAULT_CANVAS_W, DEFAULT_CANVAS_H);
const FIRST_APPEARS = timelapseNoteText({ kind: ABSENCE.FIRST_APPEARS, day: '2026-09-08' });
const isVeil = (f) => f.rule === 'evenodd';

/** Where run k draws the area `name` on the default-size canvas. */
function bubbleAt(k, name) {
  const node = createSkyTimeline((j) => areaSetAt(DATA, j), DATA.runs).sceneAt(k).nodes.get(name);
  return { clientX: FRAME.cx + node.x * FRAME.s, clientY: FRAME.cy + node.y * FRAME.s };
}

/** Render, then wait for run 0's static sky (the dotted area) to be drawn. */
async function drawn(tl) {
  const view = render(<RiskTimelapseView timelapse={tl} dark={false} showLabels />);
  await waitFor(() => expect(ctx.setLineDash).toHaveBeenCalledWith([GHOST_DASH_PX, GHOST_DASH_PX]));
  return { ...view, sky: view.container.querySelector('canvas[tabindex="0"]') };
}
const timelapse = (over = {}) => ({ data: DATA, position: 0, playing: false, moveMs: 0, onSettled: vi.fn(), controls: { pause: vi.fn() }, ...over });

describe('RiskTimelapseView', () => {
  it('draws the run, the area without files dotted, and tells the playback it settled', async () => {
    const tl = timelapse();
    render(<RiskTimelapseView timelapse={tl} dark={false} showLabels />);
    await waitFor(() => expect(tl.onSettled).toHaveBeenCalledWith(0));
    await waitFor(() => expect(ctx.setLineDash).toHaveBeenCalledWith([GHOST_DASH_PX, GHOST_DASH_PX]));
  });

  it('hover on a dotted area says when it first appears, without redrawing the static sky', async () => {
    const { container, sky } = await drawn(timelapse());
    const staticDraws = ctx.createRadialGradient.mock.calls.length;
    fireEvent.mouseMove(sky, bubbleAt(0, 'lib'));
    expect(container.querySelector('.map-tooltip')).toHaveTextContent(FIRST_APPEARS);
    expect(ctx.createRadialGradient.mock.calls.length).toBe(staticDraws);
  });

  it('while playing the pointer hovers nothing: no veil, no tooltip', async () => {
    const { container, sky } = await drawn(timelapse({ playing: true }));
    const veils = ctx.fills.filter(isVeil).length;
    fireEvent.mouseMove(sky, bubbleAt(0, 'lib'));
    expect(ctx.fills.filter(isVeil).length).toBe(veils);
    expect(container.querySelector('.map-tooltip')).toBeNull();
  });

  it('a step to another run clears the tooltip', async () => {
    const tl = timelapse();
    const { container, sky, rerender } = await drawn(tl);
    fireEvent.mouseMove(sky, bubbleAt(0, 'lib'));
    rerender(<RiskTimelapseView timelapse={{ ...tl, position: 1 }} dark={false} showLabels />);
    await waitFor(() => expect(tl.onSettled).toHaveBeenCalledWith(1));
    expect(container.querySelector('.map-tooltip')).toBeNull();
  });

  it('a dotted area reads as absent, not clean, on the canvas and in the keyboard list', async () => {
    await drawn(timelapse());
    expect(screen.getByRole('button', { name: t('map.riskAreaAbsentAria', { name: 'lib', note: FIRST_APPEARS }) })).toBeInTheDocument();
    expect(ctx.fillText).toHaveBeenCalledWith(FIRST_APPEARS, expect.any(Number), expect.any(Number));
    expect(ctx.fillText).not.toHaveBeenCalledWith(t('map.riskClean'), expect.any(Number), expect.any(Number));
  });

  it('draws the history-wide rings, not the run\'s own', async () => {
    const data = history([
      { day: '2026-09-01', new: 0, fixed: 0, areas: [metrics('app', 0.5)], files: [0, 1, 2, 3, 4].map(row), gone: [] },
      { day: '2026-09-08', new: 0, fixed: 0, areas: [metrics('app', 3)], files: [], gone: [] },
    ]);
    const tl = timelapse({ data });
    render(<RiskTimelapseView timelapse={tl} dark={false} showLabels />);
    await waitFor(() => expect(tl.onSettled).toHaveBeenCalledWith(0));
    const wide = createSkyTimeline((j) => areaSetAt(data, j), data.runs).rings;
    const own = skyRings(areaSetAt(data, 0).areas);
    expect(own.fixFirst).not.toBeCloseTo(wide.fixFirst);
    await waitFor(() => expect(ctx.arc).toHaveBeenCalledWith(FRAME.cx, FRAME.cy, wide.fixFirst * FRAME.s, 0, TAU));
    expect(ctx.arc).not.toHaveBeenCalledWith(FRAME.cx, FRAME.cy, own.fixFirst * FRAME.s, 0, TAU);
  });

  it('a click while playing pauses', async () => {
    const tl = timelapse({ playing: true });
    const { container } = render(<RiskTimelapseView timelapse={tl} dark={false} showLabels />);
    await waitFor(() => expect(tl.onSettled).toHaveBeenCalled());
    fireEvent.click(container.querySelector('canvas[tabindex="0"]'));
    expect(tl.controls.pause).toHaveBeenCalled();
  });
});
