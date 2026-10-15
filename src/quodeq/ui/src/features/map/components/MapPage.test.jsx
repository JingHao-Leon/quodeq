import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import MapPage from './MapPage.jsx';
import { stubResizeObserver } from '../../../test-utils/packFixture.js';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { t } from '../../../strings/index.js';
import { fakeCanvasContext } from '../../../test-utils/fakeCanvasContext.js';

// The circle pack observes its container size.
beforeEach(() => { stubResizeObserver(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// Covers evaluate CTA gating for shared projects and the shared read-only
// chip. MapPage previously never
// received selectedSource at all (App.jsx's `map` renderer didn't thread
// it), so the "Start evaluation" CTA in the no-evaluations-yet empty state
// always rendered even for a shared project.
function baseData(overrides = {}) {
  return {
    accumulated: null,
    dashboard: null,
    projectName: 'Shared Repo',
    projects: [{ id: 'p1', name: 'p1' }],
    projectsLoaded: true,
    selectedProject: 'shared-1',
    selectedSource: 'shared',
    loading: false,
    isFetching: false,
    ...overrides,
  };
}

const FORMULA = { current: { severityWeight: { critical: 4, major: 2, minor: 0.25 } } };

function fakeApi(overrides = {}) {
  return {
    getMapHistory: vi.fn().mockResolvedValue({ activitySource: 'none', frames: [] }),
    getGradeFormula: vi.fn().mockResolvedValue(FORMULA),
    ...overrides,
  };
}

function renderPage(data, callbacks = {}, api = fakeApi()) {
  return render(<MapPage data={data} callbacks={callbacks} />, { wrapper: withStableQueryApi(api) });
}

describe('MapPage — evaluate CTA gating for shared (Critical 1)', () => {
  it('shared source, no evaluations yet: no Start evaluation CTA, shared-specific copy', () => {
    renderPage(baseData());
    expect(screen.getByText('No completed evaluation yet')).toBeInTheDocument();
    expect(screen.getByText('no completed evaluation in this remote project yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start evaluation' })).toBeNull();
  });

  it('local source, no evaluations yet: Start evaluation CTA present (existing behavior)', () => {
    renderPage(baseData({ selectedSource: 'local', selectedProject: 'p1' }));
    expect(screen.getByRole('button', { name: 'Start evaluation' })).toBeInTheDocument();
  });
});

describe('MapPage, teammate persona: shared selection + zero local projects', () => {
  it('shared source with an empty LOCAL projects list renders the shared content path, not the Add-a-project wall', () => {
    renderPage(baseData({ projects: [] }));
    expect(screen.queryByText('No projects yet')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a project' })).toBeNull();
  });

  it('local source with an empty local projects list still shows the Add-a-project wall (unchanged)', () => {
    renderPage(baseData({ selectedSource: 'local', selectedProject: '', projects: [] }));
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
  });
});

describe('MapPage — scenario 9: loader gate, containment, refresh dim', () => {
  it('background refetch over an empty project keeps the empty state, no loader', () => {
    const { container } = renderPage(baseData({ loading: false, isFetching: true }));
    expect(container.querySelector('.loading-screen')).toBeNull();
    expect(screen.getByText('No completed evaluation yet')).toBeInTheDocument();
  });

  it('initial load renders exactly one inline loader inside the page frame', () => {
    const { container } = renderPage(baseData({ loading: true, isFetching: true }));
    expect(container.querySelectorAll('.loading-screen').length).toBe(1);
    const loader = container.querySelector('.loading-screen--inline');
    expect(loader).not.toBeNull();
    const frame = container.querySelector('.map-page--terminal');
    expect(frame).not.toBeNull();
    expect(frame.contains(loader)).toBe(true);
  });

  it('applies the refresh dim class to the empty state during a background refetch', () => {
    const { container } = renderPage(baseData({ loading: false, isFetching: true }));
    expect(container.querySelector('.map-page--terminal').className).toContain('section-pending');
  });

  it('applies the refresh dim class to real content during a background refetch', () => {
    const DIMS = [{ dimension: 'security', violations: [], compliance: [] }];
    const { container } = renderPage(baseData({
      accumulated: { dimensions: DIMS }, loading: false, isFetching: true,
    }));
    expect(container.querySelector('.map-page--terminal').className).toContain('section-pending');
  });
});

describe('MapPage — error state + retry feedback (P4-T2)', () => {
  it('error + no data renders the framed error state with a working Retry', () => {
    const onRetry = vi.fn();
    renderPage(
      baseData({ selectedSource: 'local', selectedProject: 'p1', error: 'Failed to load' }),
      { onRetry },
    );
    expect(screen.getByText("Couldn't load this project")).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('error + isFetching renders the inline loader instead of the error state', () => {
    const { container } = renderPage(
      baseData({ selectedSource: 'local', selectedProject: 'p1', error: 'Failed to load', isFetching: true }),
    );
    expect(screen.queryByText("Couldn't load this project")).toBeNull();
    expect(container.querySelector('.loading-screen')).toBeTruthy();
  });

  it('data present with a stale error still renders the data, not the error screen', () => {
    const DIMS = [{ dimension: 'security', violations: [], compliance: [] }];
    renderPage(baseData({
      selectedSource: 'local', selectedProject: 'p1',
      accumulated: { dimensions: DIMS },
      error: 'Failed to load',
    }));
    expect(screen.queryByText("Couldn't load this project")).toBeNull();
  });
});

/* Mimics the App wiring (see ROUTE_RENDERERS.map): path/vizStyle/viewMode/
   galaxyMode are route params — drilling into a folder pushes a nav-stack
   entry, navigating up to a path already in the trail unwinds to it, and
   mode/style toggles replace in place. The harness keeps a tiny stack plus
   an action log so the push/replace/unwind contract is exercised, not just
   that the view flipped. */
function NavHarness({ data, log }) {
  const [stack, setStack] = useState([{}]);
  const top = stack[stack.length - 1];
  const replaceTop = (patch) => setStack((s) => s.slice(0, -1).concat([{ ...s[s.length - 1], ...patch }]));
  const nav = {
    path: top.path || '',
    vizStyle: top.vizStyle,
    viewMode: top.viewMode,
    galaxyMode: top.galaxyMode,
    onPathChange: (path) => setStack((s) => {
      for (let i = s.length - 2; i >= 0; i--) {
        if ((s[i].path || '') === path) { log.push(['goTo', i]); return s.slice(0, i + 1); }
      }
      log.push(['push', path]);
      return s.concat([{ ...s[s.length - 1], path }]);
    }),
    onVizStyleChange: (v) => { log.push(['replace', 'vizStyle', v]); replaceTop({ vizStyle: v }); },
    onViewModeChange: (v) => { log.push(['replace', 'viewMode', v]); replaceTop({ viewMode: v }); },
    onGalaxyModeChange: (v) => { log.push(['replace', 'galaxyMode', v]); replaceTop({ galaxyMode: v }); },
  };
  return <MapPage data={data} callbacks={{}} nav={nav} />;
}

describe('MapPage — drill-down and toggles live in the nav stack', () => {
  // Two top-level entries so collapseSingleChildren keeps `src` as a
  // distinct drillable folder.
  const DIMS = [{
    dimension: 'security',
    violations: [
      { file: 'src/a.py', severity: 'minor', principle: 'P1' },
      { file: 'src/b.py', severity: 'major', principle: 'P1' },
      { file: 'main.py', severity: 'minor', principle: 'P2' },
    ],
    compliance: [],
  }];
  const data = () => ({
    accumulated: { dimensions: DIMS },
    dashboard: null,
    projectName: 'proj',
    projects: [{ id: 'p1', name: 'p1' }],
    projectsLoaded: true,
    selectedProject: 'p1',
    selectedSource: 'local',
    loading: false,
    isFetching: false,
  });

  it('style toggle replaces, folder drill pushes, breadcrumb-up unwinds to the trail entry', () => {
    const log = [];
    render(<NavHarness data={data()} log={log} />, { wrapper: withStableQueryApi(fakeApi()) });

    // Away to Risk and back to the pack: replaces, not pushes.
    fireEvent.click(screen.getByRole('button', { name: t('map.vizRisk') }));
    fireEvent.click(screen.getByRole('button', { name: t('map.vizCirclePack') }));
    expect(log).toEqual([['replace', 'vizStyle', 'risk'], ['replace', 'vizStyle', 'zoompack']]);

    // A non-default pack colour, so the unwind below can show it kept.
    fireEvent.click(screen.getByRole('button', { name: t('map.colorActivity') }));

    // Drill into the `src` folder (its keyboard stand-in): a push.
    fireEvent.keyDown(screen.getByRole('button', { name: /^src\b/ }), { key: 'Enter' });
    expect(log[3]).toEqual(['push', 'src']);
    // The controlled path round-tripped: breadcrumb now shows the folder.
    expect(screen.getAllByText('src').length).toBeGreaterThan(0);

    // Breadcrumb back to the project root: unwinds to the earlier entry
    // (the browser-back equivalent), never a fresh push.
    fireEvent.click(screen.getByRole('button', { name: 'proj' }));
    expect(log[4]).toEqual(['goTo', 0]);
    // The unwound entry still carries the colour set by the replace.
    expect(screen.getByRole('button', { name: t('map.colorActivity') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('view-mode toggle on the circle pack replaces in place', () => {
    const log = [];
    render(<NavHarness data={data()} log={log} />, { wrapper: withStableQueryApi(fakeApi()) });
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
    expect(log).toEqual([['replace', 'viewMode', 'activity']]);
    expect(screen.getByRole('button', { name: 'Activity' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('MapPage: Concentration and Activity', () => {
  const DIMS = [{
    dimension: 'security',
    violations: [{ file: 'src/a.py', severity: 'minor', principle: 'P1' }, { file: 'main.py', severity: 'minor', principle: 'P2' }],
    compliance: [],
  }];
  const local = () => baseData({ selectedSource: 'local', selectedProject: 'p1', projectName: 'p1', accumulated: { dimensions: DIMS } });

  it('the pack offers Concentration and Activity, not Health or Violations', () => {
    renderPage(local());
    expect(screen.getByRole('button', { name: t('map.colorConcentration') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('map.colorActivity') })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Health' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Violations' })).toBeNull();
  });

  it('a project without history cannot pick Activity, and the button says why', async () => {
    renderPage(local());
    const button = screen.getByRole('button', { name: t('map.colorActivity') });
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(button).toHaveAttribute('title', t('map.activityUnavailable'));
    expect(document.getElementById(button.getAttribute('aria-describedby'))).toHaveTextContent(t('map.activityUnavailable'));
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('a shared project with history can pick Activity', async () => {
    const sharedGetMapHistory = vi.fn().mockResolvedValue({ activitySource: 'estimated', fileNames: [], frames: [] });
    renderPage(baseData({ accumulated: { dimensions: DIMS } }), {}, fakeApi({ sharedGetMapHistory }));
    const button = screen.getByRole('button', { name: t('map.colorActivity') });
    await waitFor(() => expect(sharedGetMapHistory).toHaveBeenCalled());
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
  });

  it('the history is not fetched on the Galaxy', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCanvasContext());
    const api = fakeApi();
    render(<MapPage data={local()} callbacks={{}} nav={{ vizStyle: 'galaxy' }} />, { wrapper: withStableQueryApi(api) });
    expect(api.getMapHistory).not.toHaveBeenCalled();
  });

  it('Concentration draws without waiting for the history', () => {
    const api = fakeApi({ getMapHistory: vi.fn(() => new Promise(() => {})) });
    const { container } = renderPage(local(), {}, api);
    expect(container.querySelector('canvas')).toBeInTheDocument();
  });

  it('a failed history under Activity is explained in the legend', async () => {
    const rejects = [];
    const api = fakeApi({ getMapHistory: vi.fn(() => new Promise((_, rej) => { rejects.push(rej); })) });
    render(<NavHarness data={local()} log={[]} />, { wrapper: withStableQueryApi(api) });
    fireEvent.click(screen.getByRole('button', { name: t('map.colorActivity') }));
    await waitFor(() => expect(api.getMapHistory).toHaveBeenCalled());
    rejects.forEach((reject) => reject(new Error('boom')));
    expect(await screen.findByText(t('map.activityUnavailable'), { selector: '.pack-legend-note' })).toBeInTheDocument();
  });
});

describe('MapPage — shared read-only chip (Finding 6)', () => {
  const DIMS = [{ dimension: 'security', violations: [], compliance: [] }];

  it('shows the chip for a shared project with data', () => {
    renderPage(baseData({ accumulated: { dimensions: DIMS } }));
    expect(screen.getByText('remote · read-only')).toBeInTheDocument();
  });

  it('omits the chip for a local project', () => {
    renderPage(baseData({ selectedSource: 'local', selectedProject: 'p1', accumulated: { dimensions: DIMS } }));
    expect(screen.queryByText('remote · read-only')).toBeNull();
  });
});
