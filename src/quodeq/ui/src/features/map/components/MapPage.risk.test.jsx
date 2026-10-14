import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import MapPage from './MapPage.jsx';
import { stubResizeObserver } from '../../../test-utils/packFixture.js';
import { withStableQueryApi } from '../../../test-utils/withQueryClient.jsx';
import { fakeCanvasContext } from '../../../test-utils/fakeCanvasContext.js';
import { t } from '../../../strings/index.js';

// The Risk sky and the pack paint on canvas and observe their container.
beforeEach(() => {
  stubResizeObserver();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCanvasContext());
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const FORMULA = { current: { severityWeight: { critical: 4, major: 2, minor: 0.25 } } };

const baseData = (overrides) => ({
  accumulated: null, dashboard: null, projectName: 'p1', projects: [{ id: 'p1', name: 'p1' }], projectsLoaded: true,
  selectedProject: 'p1', selectedSource: 'local', loading: false, isFetching: false, ...overrides,
});

// The view-style toggle replaces the nav entry in place (see ROUTE_RENDERERS.map).
function NavHarness({ data, log }) {
  const [vizStyle, setVizStyle] = useState(undefined);
  const nav = { path: '', vizStyle, onVizStyleChange: (v) => { log.push(['replace', 'vizStyle', v]); setVizStyle(v); } };
  return <MapPage data={data} callbacks={{}} nav={nav} />;
}

describe('MapPage: the Risk tab', () => {
  const DIMS = [{
    dimension: 'security',
    violations: [
      { file: 'src/app/a.py', severity: 'minor', principle: 'P1' },
      { file: 'src/app/b.py', severity: 'major', principle: 'P1' },
      { file: 'docs/x.md', severity: 'minor', principle: 'P2' },
    ],
    compliance: [],
  }];
  // One area of six files (five in src/app, one in src/lib) beside a docs area.
  const PATHS = ['src/app/a.py', 'src/app/b.py', 'src/app/c.py', 'src/app/d.py', 'src/app/e.py', 'src/lib/f.py', 'docs/x.md'];
  const HISTORY = {
    activitySource: 'git', fileNames: PATHS,
    fileArea: [...PATHS.slice(0, -1).map(() => 'checkout'), 'docs'], fileLayer: PATHS.map(() => 'feature'),
    frames: [{
      files: PATHS.map((_, i) => [i, 1, 1, 2, 0, 0, 0, 0, 0]),
      areas: [
        { area: 'checkout', files: 6, density: 1.2, kind: 'hotspot', touchedShare: 0.5 },
        { area: 'docs', files: 1, density: 0.1, kind: 'small', touchedShare: 0 },
      ],
    }],
  };
  const local = () => baseData({ accumulated: { dimensions: DIMS } });
  const riskApi = () => ({ getMapHistory: vi.fn().mockResolvedValue(HISTORY), getGradeFormula: vi.fn().mockResolvedValue(FORMULA) });

  function renderRisk(callbacks, nav) {
    return render(<MapPage data={local()} callbacks={callbacks} nav={{ vizStyle: 'risk', ...nav }} />, { wrapper: withStableQueryApi(riskApi()) });
  }

  it('the tabs are Circle Pack, Risk and Galaxy', () => {
    render(<MapPage data={local()} callbacks={{}} />, { wrapper: withStableQueryApi(riskApi()) });
    const group = screen.getByRole('button', { name: t('map.vizCirclePack') }).parentElement;
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual([t('map.vizCirclePack'), t('map.vizRisk'), t('map.vizGalaxy')]);
  });

  it('choosing Risk replaces the entry and hides the Dimensions control', () => {
    const log = [];
    render(<NavHarness data={{ ...local(), accumulated: { dimensions: [...DIMS, { ...DIMS[0], dimension: 'performance' }] } }} log={log} />, { wrapper: withStableQueryApi(riskApi()) });
    expect(screen.getByRole('button', { name: t('map.dimensions') })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('map.vizRisk') }));
    expect(log).toEqual([['replace', 'vizStyle', 'risk']]);
    expect(screen.queryByRole('button', { name: t('map.dimensions') })).toBeNull();
  });

  it('View Details opens the Violations workbench filtered to the area, as one area chip of its paths', async () => {
    const onNavigate = vi.fn();
    renderRisk({ onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: /checkout/ }));
    fireEvent.click(screen.getByRole('button', { name: t('map.viewDetails') }));
    expect(onNavigate).toHaveBeenCalledWith('violations', { wb: { area: { name: 'checkout', paths: ['src/'] } } });
  });
});

describe('MapPage: a visit to the Circle Pack', () => {
  const TREE_FILES = [...Array.from({ length: 9 }, (_, i) => `app/f${i}.py`), 'README.md'];
  const DIMS = [{ dimension: 'security', violations: TREE_FILES.map((file) => ({ file, severity: 'minor', principle: 'P1' })), compliance: [] }];
  const AREA_FILES = Array.from({ length: 6 }, (_, i) => `tools/t${i}.py`);
  const HISTORY = {
    activitySource: 'git', fileNames: AREA_FILES, fileArea: AREA_FILES.map(() => 'tools'), fileLayer: AREA_FILES.map(() => 'feature'),
    frames: [{ files: AREA_FILES.map((_, i) => [i, 1, 1, 2, 0, 0, 0, 0, 0]), areas: [{ area: 'tools', files: 6, density: 1.2, kind: 'hotspot', touchedShare: 0.5 }] }],
  };
  const api = () => ({ getMapHistory: vi.fn().mockResolvedValue(HISTORY), getGradeFormula: vi.fn().mockResolvedValue(FORMULA) });

  // Mirrors mapRoute: a drill pushes an entry.
  function PackHarness({ start, log }) {
    const [entry, setEntry] = useState(start);
    const nav = { ...entry, onPathChange: (path) => { log.push(['push', path]); setEntry((e) => ({ vizStyle: e.vizStyle, path })); } };
    return <MapPage data={baseData({ accumulated: { dimensions: DIMS } })} callbacks={{}} nav={nav} />;
  }

  it('opens the dominant folder', () => {
    const log = [];
    render(<PackHarness start={{ vizStyle: 'zoompack' }} log={log} />, { wrapper: withStableQueryApi(api()) });
    expect(log).toEqual([['push', 'app']]);
  });
});
