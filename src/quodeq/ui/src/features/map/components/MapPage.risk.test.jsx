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
        { area: 'checkout', files: 6, needPct: 0.8, kind: 'hotspot', touchedShare: 0.5 },
        { area: 'docs', files: 1, needPct: 0.1, kind: 'small', touchedShare: 0 },
      ],
    }],
  };
  const local = () => baseData({ accumulated: { dimensions: DIMS } });
  const riskApi = () => ({ getMapHistory: vi.fn().mockResolvedValue(HISTORY), getGradeFormula: vi.fn().mockResolvedValue(FORMULA) });

  function renderRisk(callbacks, nav) {
    return render(<MapPage data={local()} callbacks={callbacks} nav={{ vizStyle: 'risk', ...nav }} />, { wrapper: withStableQueryApi(riskApi()) });
  }

  it('the tabs are Circle Pack, Galaxy and Risk', () => {
    render(<MapPage data={local()} callbacks={{}} />, { wrapper: withStableQueryApi(riskApi()) });
    const group = screen.getByRole('button', { name: t('map.vizCirclePack') }).parentElement;
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual([t('map.vizCirclePack'), 'Galaxy', t('map.vizRisk')]);
    expect(screen.queryByRole('button', { name: t('map.vizRiskMatrix') })).toBeNull();
  });

  it('choosing Risk replaces the entry and hides the Dimensions control', () => {
    const log = [];
    render(<NavHarness data={{ ...local(), accumulated: { dimensions: [...DIMS, { ...DIMS[0], dimension: 'performance' }] } }} log={log} />, { wrapper: withStableQueryApi(riskApi()) });
    expect(screen.getByRole('button', { name: t('map.dimensions') })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('map.vizRisk') }));
    expect(log).toEqual([['replace', 'vizStyle', 'risk']]);
    expect(screen.queryByRole('button', { name: t('map.dimensions') })).toBeNull();
  });

  it('View Details opens the Violations workbench on the area\'s paths', async () => {
    const onNavigate = vi.fn();
    renderRisk({ onNavigate });
    fireEvent.click(await screen.findByRole('button', { name: /checkout/ }));
    fireEvent.click(screen.getByRole('button', { name: t('map.viewDetails') }));
    expect(onNavigate).toHaveBeenCalledWith('violations', { wb: { paths: ['src/'] } });
  });

  it('Show in Circle Pack opens the pack at the area\'s largest folder', async () => {
    const onShowInPack = vi.fn();
    renderRisk({}, { onShowInPack });
    fireEvent.click(await screen.findByRole('button', { name: /checkout/ }));
    fireEvent.click(screen.getByRole('button', { name: t('map.riskShowInPack') }));
    expect(onShowInPack).toHaveBeenCalledWith('src/app');
  });
});
