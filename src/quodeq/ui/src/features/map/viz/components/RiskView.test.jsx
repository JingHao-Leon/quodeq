import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RiskView from './RiskView.jsx';
import { fakeCanvasContext } from '../../../../test-utils/fakeCanvasContext.js';
import { t } from '../../../../strings/index.js';
import { AREA_KIND } from '../../mapVocab.js';
import { stubResizeObserver } from '../../../../test-utils/packFixture.js';
import { layoutSky, skyAreas } from '../core/skyLayout.js';
import { skyFrame } from '../core/skyLayers.js';
import { DEFAULT_CANVAS_W, DEFAULT_CANVAS_H } from '../core/galaxyTunables.js';

const area = (name, files, kind) => ({ name, density: 0.9, kind, touchedShare: 0.2, layers: ['feature'], dots: [{ path: `${name}/a.kt`, stats: { violations: 0, compliance: 2, weight: 0, files: 1, critical: 0, major: 0 }, checks: 2 }], stats: { violations: 3, compliance: 9, weight: 2, files, critical: 0, major: 1 } });
const READY = { areaSet: { areas: [area('article', 8, AREA_KIND.HOTSPOT), area('tiny', 2, AREA_KIND.SMALL)], files: [], average: 1 }, loading: false, failed: false };
const props = (areaState) => ({ areaState, dark: true, showLabels: true, resetKey: 0, onViewDetails: vi.fn() });

/** RiskView with its selection held by name, as the Risk tab holds it; `onSelectName` sees every change. */
function Selecting({ onSelectName = () => {}, initial = null, ...p }) {
  const [selectedName, setName] = useState(initial);
  const select = (name) => { onSelectName(name); setName(name); };
  return <RiskView {...p} selection={{ selectedName, onSelectName: select }} />;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCanvasContext());
  vi.stubGlobal('devicePixelRatio', 1);
  stubResizeObserver();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('RiskView states', () => {
  it('loading, failed and empty each say so', () => {
    const { rerender } = render(<Selecting {...props({ ...READY, loading: true })} />);
    expect(screen.getByText(t('map.riskLoading'))).toBeInTheDocument();
    rerender(<Selecting {...props({ ...READY, failed: true })} />);
    expect(screen.getByText(t('map.riskFailed'))).toBeInTheDocument();
    rerender(<Selecting {...props({ ...READY, areaSet: { areas: [area('tiny', 2, AREA_KIND.SMALL)], files: [], average: 1 } })} />);
    expect(screen.getByText(t('map.riskEmpty'))).toBeInTheDocument();
  });
});

describe('RiskView selection', () => {
  it('areas under five files get no bubble; selecting one opens its panel with View Details as its one action besides close', () => {
    const p = props(READY);
    render(<Selecting {...p} />);
    expect(screen.queryByRole('button', { name: /tiny/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /article/ }));
    const region = screen.getByRole('region', { name: t('map.riskPanelAria', { name: 'article' }) });
    expect([...region.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent)).toEqual([t('map.panelClose'), t('map.viewDetails')]);
    fireEvent.click(screen.getByRole('button', { name: t('map.viewDetails') }));
    expect(p.onViewDetails).toHaveBeenCalledWith(expect.objectContaining({ name: 'article' }));
  });

  it('the selection is held by area name: a click reports the name, and a name held by the tab opens its panel', () => {
    const onSelectName = vi.fn();
    const { unmount } = render(<Selecting {...props(READY)} onSelectName={onSelectName} />);
    fireEvent.click(screen.getByRole('button', { name: /article/ }));
    expect(onSelectName).toHaveBeenCalledWith('article');
    unmount();
    render(<Selecting {...props(READY)} initial="article" />);
    expect(screen.getByRole('region', { name: t('map.riskPanelAria', { name: 'article' }) })).toBeInTheDocument();
  });

  it('a name the sky does not hold opens no panel', () => {
    render(<Selecting {...props(READY)} initial="tiny" />);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('the panel shows the layer tag', () => {
    render(<Selecting {...props(READY)} />);
    fireEvent.click(screen.getByRole('button', { name: /article/ }));
    expect(screen.getByText('feature')).toBeInTheDocument();
  });
});

describe('RiskView keyboard selection', () => {
  it('choosing an area from the keyboard list moves focus to View Details in a region named for the area', () => {
    render(<Selecting {...props(READY)} />);
    fireEvent.click(screen.getByRole('button', { name: /article/ }));
    const region = screen.getByRole('region', { name: t('map.riskPanelAria', { name: 'article' }) });
    expect(region).toContainElement(document.activeElement);
    expect(document.activeElement).toHaveAccessibleName(t('map.viewDetails'));
  });

  it('Escape in the panel clears the selection and returns focus to the sky', () => {
    render(<Selecting {...props(READY)} />);
    fireEvent.click(screen.getByRole('button', { name: /article/ }));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('region')).toBeNull();
    expect(document.activeElement).toHaveAccessibleName(t('map.riskSkyAria'));
  });
});

describe('RiskView panel close', () => {
  it('the close button clears the selection', () => {
    const onSelectName = vi.fn();
    render(<Selecting {...props(READY)} onSelectName={onSelectName} />);
    fireEvent.click(screen.getByRole('button', { name: /article/ }));
    fireEvent.click(screen.getByRole('button', { name: t('map.panelClose') }));
    expect(onSelectName).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('RiskView hover', () => {
  it('the hovered area\'s card is docked in the corner, not at the pointer', () => {
    const { container } = render(<Selecting {...props(READY)} />);
    const frame = skyFrame(DEFAULT_CANVAS_W, DEFAULT_CANVAS_H);
    const [node] = layoutSky(skyAreas(READY.areaSet));
    fireEvent.mouseMove(container.querySelector('canvas[tabindex="0"]'), { clientX: frame.cx + node.x * frame.s, clientY: frame.cy + node.y * frame.s });
    const card = container.querySelector('.map-tooltip');
    expect(card).toHaveClass('map-tooltip--docked');
    expect(card).toHaveTextContent('article');
    expect(card.getAttribute('style')).toBeNull();
  });
});
