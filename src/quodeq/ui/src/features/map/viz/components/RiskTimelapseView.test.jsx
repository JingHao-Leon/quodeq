import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { stubPackCanvas } from '../../../../test-utils/packFixture.js';
import RiskTimelapseView from './RiskTimelapseView.jsx';
import { decodeTimelapse } from '../../model/mapTimelapse.js';
import { createSkyTimeline } from '../core/skyTimeline.js';
import { skyFrame } from '../core/skyLayers.js';
import { skyAreas } from '../core/skyLayout.js';
import { skyRings } from '../core/skyScale.js';
import { TAU } from '../core/galaxyCore.js';
import { t } from '../../../../strings/index.js';
import { DEFAULT_CANVAS_W, DEFAULT_CANVAS_H } from '../core/galaxyTunables.js';
import { areaSetAt } from '../../model/mapAreas.js';

const PATHS = ['app/a.py', 'app/b.py', 'app/c.py', 'app/d.py', 'app/e.py', 'lib/f.py', 'lib/g.py', 'lib/h.py', 'lib/i.py', 'lib/j.py'];
const row = (i, issues = 1) => [i, issues, issues, 1, 0, 0, 0, 0];
const metrics = (area, density = 0) => ({ area, kind: 'watch', density, touchedShare: 0 });
const history = (frames) => decodeTimelapse({
  activitySource: 'git', fileNames: PATHS, fileArea: PATHS.map((p) => p.split('/')[0]), fileLayer: PATHS.map(() => ''), frameEncoding: 'delta', frames,
});
// Run 0 has only app (five issues); run 1 adds lib and gives app eight issues.
const DATA = history([
  { day: '2026-09-01', new: 0, fixed: 0, areas: [metrics('app')], files: [0, 1, 2, 3, 4].map((i) => row(i)), gone: [] },
  { day: '2026-09-08', new: 5, fixed: 0, areas: [metrics('app'), metrics('lib')], files: [row(0, 4), ...[5, 6, 7, 8, 9].map((i) => row(i))], gone: [] },
]);
let ctx;
beforeEach(() => { ctx = stubPackCanvas(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const FRAME = skyFrame(DEFAULT_CANVAS_W, DEFAULT_CANVAS_H);
const panelOf = (name) => screen.queryByRole('region', { name: t('map.riskPanelAria', { name }) });
const issuesIn = (el) => within(el).getByText(t('map.riskIssues')).nextSibling.textContent;

let timelines = new WeakMap();
beforeEach(() => { timelines = new WeakMap(); });
/** The Risk tab's timeline for a history: one per data within a test, as useSkyTimeline keeps it. */
function timelineOf(data) {
  if (!timelines.has(data)) timelines.set(data, createSkyTimeline((j) => areaSetAt(data, j), data.runs));
  return timelines.get(data);
}

/** Where run k draws the area `name` on the default-size canvas. */
function bubbleAt(k, name, data = DATA) {
  const node = timelineOf(data).sceneAt(k).nodes.get(name);
  return { clientX: FRAME.cx + node.x * FRAME.s, clientY: FRAME.cy + node.y * FRAME.s };
}

/** The time-lapse view with its selection held by name, as the Risk tab holds it. */
function Past({ tl, showLabels = true, initial = null }) {
  const [selectedName, onSelectName] = useState(initial);
  return <RiskTimelapseView timelapse={tl} timeline={timelineOf(tl.data)} dark={false} showLabels={showLabels} selection={{ selectedName, onSelectName }} />;
}
const timelapse = (over = {}) => ({ data: DATA, position: 0, playing: false, moveMs: 0, onSettled: vi.fn(), ...over });

/** Render, then wait for the run's sky to settle and be drawn. */
async function drawn(tl, props = {}) {
  const view = render(<Past tl={tl} {...props} />);
  await waitFor(() => expect(tl.onSettled).toHaveBeenCalledWith(tl.position));
  await waitFor(() => expect(ctx.arc).toHaveBeenCalled());
  return { ...view, sky: view.container.querySelector('canvas[tabindex="0"]') };
}

describe('RiskTimelapseView: each run as it was', () => {
  it('a run lists only its own areas; one it does not have is not a bubble', async () => {
    await drawn(timelapse());
    expect(screen.getByRole('button', { name: /^app/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^lib/ })).toBeNull();
  });

  it('draws the run\'s own rings', async () => {
    const data = history([
      { day: '2026-09-01', new: 0, fixed: 0, areas: [metrics('app', 0.6)], files: [0, 1, 2, 3, 4].map((i) => row(i)), gone: [] },
      { day: '2026-09-08', new: 5, fixed: 0, areas: [metrics('app', 0.1), metrics('lib', 3)], files: [5, 6, 7, 8, 9].map((i) => row(i)), gone: [] },
    ]);
    const own = (k) => skyRings(skyAreas(areaSetAt(data, k)));
    expect(own(0).fixFirst).not.toBeCloseTo(own(1).fixFirst);
    await drawn(timelapse({ data, position: 1 }));
    expect(ctx.arc).toHaveBeenCalledWith(FRAME.cx, FRAME.cy, own(1).fixFirst * FRAME.s, 0, TAU);
    expect(ctx.arc).not.toHaveBeenCalledWith(FRAME.cx, FRAME.cy, own(0).fixFirst * FRAME.s, 0, TAU);
  });

  it('the legend lists every ring kind of the history on every run, so it never grows or shrinks while playing', async () => {
    const data = history([
      { day: '2026-09-01', new: 0, fixed: 0, areas: [metrics('app')], files: [0, 1, 2, 3, 4].map((i) => row(i)), gone: [] },
      { day: '2026-09-08', new: 5, fixed: 0, areas: [{ ...metrics('app'), kind: 'hotspot' }, metrics('lib')], files: [5, 6, 7, 8, 9].map((i) => row(i)), gone: [] },
    ]);
    await drawn(timelapse({ data }));
    expect(screen.getByText(t('map.riskLegendHotspot'))).toBeInTheDocument();
  });

  it('labels on: the zone labels and area names are drawn; labels off: no label at all, not even the selected area\'s', async () => {
    const zoneLabel = t('map.riskZoneFixFirst', { count: 0 });
    const { unmount } = await drawn(timelapse());
    expect(ctx.fillText).toHaveBeenCalledWith(zoneLabel, expect.any(Number), expect.any(Number));
    expect(ctx.fillText).toHaveBeenCalledWith('app', expect.any(Number), expect.any(Number));
    unmount();
    ctx.fillText.mockClear();
    ctx.arc.mockClear();
    await drawn(timelapse(), { showLabels: false, initial: 'app' });
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});

describe('RiskTimelapseView: hover', () => {
  it('hover shows the run\'s numbers in the docked card, while playing too', async () => {
    const { container, sky } = await drawn(timelapse({ playing: true }));
    fireEvent.mouseMove(sky, bubbleAt(0, 'app'));
    const card = container.querySelector('.map-tooltip');
    expect(card).toHaveClass('map-tooltip--docked');
    expect(card).toHaveTextContent('app');
    expect(issuesIn(card)).toBe('5');
  });

  it('the hover follows its area to the next run, with that run\'s numbers', async () => {
    const tl = timelapse({ playing: true });
    const { container, sky, rerender } = await drawn(tl);
    fireEvent.mouseMove(sky, bubbleAt(0, 'app'));
    rerender(<Past tl={{ ...tl, position: 1 }} />);
    await waitFor(() => expect(tl.onSettled).toHaveBeenCalledWith(1));
    expect(issuesIn(container.querySelector('.map-tooltip'))).toBe('8');
  });

  it('a run that does not hold the hovered area shows no card', async () => {
    const tl = timelapse({ position: 1 });
    const { container, sky, rerender } = await drawn(tl);
    fireEvent.mouseMove(sky, bubbleAt(1, 'lib'));
    expect(container.querySelector('.map-tooltip')).toHaveTextContent('lib');
    rerender(<Past tl={{ ...tl, position: 0 }} />);
    await waitFor(() => expect(tl.onSettled).toHaveBeenCalledWith(0));
    expect(container.querySelector('.map-tooltip')).toBeNull();
  });
});

describe('RiskTimelapseView: selection', () => {
  it('paused, a click selects the area: its panel shows the run\'s numbers, without View Details', async () => {
    const { sky } = await drawn(timelapse());
    fireEvent.click(sky, bubbleAt(0, 'app'));
    const panel = panelOf('app');
    expect(issuesIn(panel)).toBe('5');
    expect(within(panel).queryByRole('button', { name: t('map.viewDetails') })).toBeNull();
  });

  it('paused, a click off the bubbles clears the selection', async () => {
    const { sky } = await drawn(timelapse(), { initial: 'app' });
    expect(panelOf('app')).not.toBeNull();
    fireEvent.click(sky, { clientX: 1, clientY: 1 });
    expect(panelOf('app')).toBeNull();
  });

  it('the selected area is followed over time: its panel takes each run\'s numbers', async () => {
    const tl = timelapse({ position: 1 });
    const { rerender } = await drawn(tl, { initial: 'app' });
    expect(issuesIn(panelOf('app'))).toBe('8');
    rerender(<Past tl={{ ...tl, position: 0 }} initial="app" />);
    await waitFor(() => expect(tl.onSettled).toHaveBeenCalledWith(0));
    expect(issuesIn(panelOf('app'))).toBe('5');
  });

  it('a selected area the run does not have opens no panel', async () => {
    await drawn(timelapse(), { initial: 'lib' });
    expect(panelOf('lib')).toBeNull();
  });

  it('while playing a click selects an area, and a click off the bubbles clears it (it never pauses)', async () => {
    const { sky } = await drawn(timelapse({ playing: true }));
    fireEvent.click(sky, bubbleAt(0, 'app'));
    expect(panelOf('app')).not.toBeNull();
    fireEvent.click(sky, { clientX: 1, clientY: 1 });
    expect(panelOf('app')).toBeNull();
  });

  it('the panel\'s close button clears the selection', async () => {
    await drawn(timelapse({ playing: true }), { initial: 'app' });
    fireEvent.click(within(panelOf('app')).getByRole('button', { name: t('map.panelClose') }));
    expect(panelOf('app')).toBeNull();
  });
});
