import { render, screen, fireEvent } from '@testing-library/react';
import RiskView from './RiskView.jsx';
import { fakeCanvasContext } from '../../../../test-utils/fakeCanvasContext.js';
import { t } from '../../../../strings/index.js';
import { AREA_KIND } from '../../mapVocab.js';
import { stubResizeObserver } from '../../../../test-utils/packFixture.js';

const area = (name, files, kind) => ({ name, needPct: 0.7, kind, touchedShare: 0.2, layers: ['feature'], dots: [{ path: `${name}/a.kt`, worst: null, checks: 2 }], stats: { violations: 3, compliance: 9, weight: 2, files, critical: 0, major: 1 } });
const READY = { areaSet: { areas: [area('article', 8, AREA_KIND.HOTSPOT), area('tiny', 2, AREA_KIND.SMALL)], files: [], average: 1 }, loading: false, failed: false, unavailable: false };
const props = (areaState) => ({ areaState, dark: true, showLabels: true, resetKey: 0, onViewDetails: vi.fn(), onShowInPack: vi.fn() });

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCanvasContext());
  vi.stubGlobal('devicePixelRatio', 1);
  stubResizeObserver();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('RiskView states', () => {
  it('a shared project explains why there is nothing to show', () => {
    render(<RiskView {...props({ ...READY, unavailable: true })} />);
    expect(screen.getByText(t('map.activityUnavailable'))).toBeInTheDocument();
  });

  it('loading, failed and empty each say so', () => {
    const { rerender } = render(<RiskView {...props({ ...READY, loading: true })} />);
    expect(screen.getByText(t('map.riskLoading'))).toBeInTheDocument();
    rerender(<RiskView {...props({ ...READY, failed: true })} />);
    expect(screen.getByText(t('map.riskFailed'))).toBeInTheDocument();
    rerender(<RiskView {...props({ ...READY, areaSet: { areas: [area('tiny', 2, AREA_KIND.SMALL)], files: [], average: 1 } })} />);
    expect(screen.getByText(t('map.riskEmpty'))).toBeInTheDocument();
  });
});

describe('RiskView selection', () => {
  it('areas under five files get no bubble; selecting one opens its panel with both actions', () => {
    const p = props(READY);
    render(<RiskView {...p} />);
    expect(screen.queryByRole('button', { name: /tiny/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /article/ }));
    fireEvent.click(screen.getByRole('button', { name: t('map.viewDetails') }));
    expect(p.onViewDetails).toHaveBeenCalledWith(expect.objectContaining({ name: 'article' }));
    fireEvent.click(screen.getByRole('button', { name: t('map.riskShowInPack') }));
    expect(p.onShowInPack).toHaveBeenCalledWith(expect.objectContaining({ name: 'article' }));
  });

  it('the panel shows the layer tag', () => {
    render(<RiskView {...props(READY)} />);
    fireEvent.click(screen.getByRole('button', { name: /article/ }));
    expect(screen.getByText('feature')).toBeInTheDocument();
  });
});
