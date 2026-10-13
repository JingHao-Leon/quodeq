import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { stubPackCanvas } from '../../../../test-utils/packFixture.js';
import RiskTimelapseView from './RiskTimelapseView.jsx';
import { decodeTimelapse } from '../../model/mapTimelapse.js';
import { GHOST_DASH_PX } from '../core/packLayers.js';
import { createSkyTimeline } from '../core/skyTimeline.js';
import { skyFrame } from '../core/skyLayers.js';
import { DEFAULT_CANVAS_W, DEFAULT_CANVAS_H } from '../core/galaxyTunables.js';
import { areaSetAt } from '../../model/mapAreas.js';
import { timelapseNoteText } from './timelapseNote.js';
import { ABSENCE } from '../core/timelapseScene.js';

const PATHS = ['app/a.py', 'app/b.py', 'app/c.py', 'app/d.py', 'app/e.py', 'lib/f.py', 'lib/g.py', 'lib/h.py', 'lib/i.py', 'lib/j.py'];
const row = (i) => [i, 1, 1, 1, 0, 0, 0, 0];
const metrics = (area) => ({ area, kind: 'watch', needPct: 0.5, touchedShare: 0 });
const DATA = decodeTimelapse({
  activitySource: 'git', fileNames: PATHS, fileArea: PATHS.map((p) => p.split('/')[0]), fileLayer: PATHS.map(() => ''), frameEncoding: 'delta',
  frames: [
    { day: '2026-09-01', new: 0, fixed: 0, areas: [metrics('app')], files: [0, 1, 2, 3, 4].map(row), gone: [] },
    { day: '2026-09-08', new: 5, fixed: 0, areas: [metrics('app'), metrics('lib')], files: [5, 6, 7, 8, 9].map(row), gone: [] },
  ],
});
let ctx;
beforeEach(() => { ctx = stubPackCanvas(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
/** Where run k draws the area `name` on the default-size canvas. */
function bubbleAt(k, name) {
  const node = createSkyTimeline((j) => areaSetAt(DATA, j), DATA.runs).sceneAt(k).nodes.get(name);
  const frame = skyFrame(DEFAULT_CANVAS_W, DEFAULT_CANVAS_H);
  return { clientX: frame.cx + node.x * frame.s, clientY: frame.cy + node.y * frame.s };
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
    const tl = timelapse();
    const { container } = render(<RiskTimelapseView timelapse={tl} dark={false} showLabels />);
    await waitFor(() => expect(ctx.setLineDash).toHaveBeenCalledWith([GHOST_DASH_PX, GHOST_DASH_PX]));
    const staticDraws = ctx.createRadialGradient.mock.calls.length;
    fireEvent.mouseMove(container.querySelector('canvas[tabindex="0"]'), bubbleAt(0, 'lib'));
    expect(container.querySelector('.map-tooltip')).toHaveTextContent(timelapseNoteText({ kind: ABSENCE.FIRST_APPEARS, day: '2026-09-08' }));
    expect(ctx.createRadialGradient.mock.calls.length).toBe(staticDraws);
  });

  it('a click while playing pauses', async () => {
    const tl = timelapse({ playing: true });
    const { container } = render(<RiskTimelapseView timelapse={tl} dark={false} showLabels />);
    await waitFor(() => expect(tl.onSettled).toHaveBeenCalled());
    fireEvent.click(container.querySelector('canvas[tabindex="0"]'));
    expect(tl.controls.pause).toHaveBeenCalled();
  });
});
