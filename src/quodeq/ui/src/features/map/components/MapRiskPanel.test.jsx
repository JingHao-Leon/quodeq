import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MapRiskPanel from './MapRiskPanel.jsx';
import { stubPackCanvas } from '../../../test-utils/packFixture.js';
import { decodeTimelapse } from '../model/mapTimelapse.js';
import { areaSetAt } from '../model/mapAreas.js';
import { t } from '../../../strings/index.js';

const PATHS = ['app/a.py', 'app/b.py', 'app/c.py', 'app/d.py', 'app/e.py', 'lib/f.py', 'lib/g.py', 'lib/h.py', 'lib/i.py', 'lib/j.py'];
const row = (i, issues = 1) => [i, issues, issues, 1, 0, 0, 0, 0];
const metrics = (area) => ({ area, kind: 'watch', density: 0, touchedShare: 0 });
// Run 0: app with five issues; run 1 (today): app with eight, and lib.
const DATA = decodeTimelapse({
  activitySource: 'git', fileNames: PATHS, fileArea: PATHS.map((p) => p.split('/')[0]), fileLayer: PATHS.map(() => ''), frameEncoding: 'delta',
  frames: [
    { day: '2026-09-01', new: 0, fixed: 0, areas: [metrics('app')], files: [0, 1, 2, 3, 4].map((i) => row(i)), gone: [] },
    { day: '2026-09-08', new: 5, fixed: 0, areas: [metrics('app'), metrics('lib')], files: [row(0, 4), ...[5, 6, 7, 8, 9].map((i) => row(i))], gone: [] },
  ],
});
const RISK = { areaState: { areaSet: areaSetAt(DATA, 1), loading: false, failed: false } };
const ACTIONS = { onViewDetails: () => {} };
const ON_SETTLED = vi.fn();
const timelapse = (over = {}) => ({
  data: DATA, project: 'p1', past: false, position: 1, playing: false, moveMs: 0, onSettled: ON_SETTLED, controls: { pause: vi.fn() }, ...over,
});
const panel = (props) => <MapRiskPanel risk={RISK} riskActions={ACTIONS} view={{ dark: false, showLabels: true, resetKey: 0, ...props.view }} timelapse={props.timelapse} />;
const appPanel = () => screen.queryByRole('region', { name: t('map.riskPanelAria', { name: 'app' }) });
const issuesIn = (el) => within(el).getByText(t('map.riskIssues')).nextSibling.textContent;

beforeEach(() => { stubPackCanvas(); ON_SETTLED.mockClear(); });
// Unmount before the stubs go: an effect the test left pending (the galaxy
// canvas observing its parent) must not mount after ResizeObserver is gone.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('MapRiskPanel: one selection for today and the time-lapse', () => {
  it('an area chosen today stays selected on a past run, with that run\'s numbers and no View Details', async () => {
    const { rerender } = render(panel({ timelapse: timelapse() }));
    fireEvent.click(screen.getByRole('button', { name: /^app/ }));
    expect(issuesIn(appPanel())).toBe('8');
    rerender(panel({ timelapse: timelapse({ past: true, position: 0 }) }));
    await waitFor(() => expect(ON_SETTLED).toHaveBeenCalledWith(0));
    expect(issuesIn(appPanel())).toBe('5');
    expect(within(appPanel()).queryByRole('button', { name: t('map.viewDetails') })).toBeNull();
  });

  it('back on today the area is still selected, with View Details', async () => {
    const { rerender } = render(panel({ timelapse: timelapse() }));
    fireEvent.click(screen.getByRole('button', { name: /^app/ }));
    rerender(panel({ timelapse: timelapse({ past: true, position: 0 }) }));
    await waitFor(() => expect(ON_SETTLED).toHaveBeenCalledWith(0));
    rerender(panel({ timelapse: timelapse() }));
    expect(within(appPanel()).getByRole('button', { name: t('map.viewDetails') })).toBeInTheDocument();
  });

  it('another project (a new reset key) starts with nothing selected', () => {
    const { rerender } = render(panel({ timelapse: timelapse() }));
    fireEvent.click(screen.getByRole('button', { name: /^app/ }));
    rerender(panel({ timelapse: timelapse(), view: { resetKey: 1 } }));
    expect(appPanel()).toBeNull();
  });
});
