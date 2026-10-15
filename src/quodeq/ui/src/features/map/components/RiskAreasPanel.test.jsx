import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RiskAreasPanel, { AREAS_SHOWN } from './RiskAreasPanel.jsx';
import { t } from '../../../strings/index.js';

const stats = (files, violations = 3, critical = 0, major = 1) => ({ files, violations, critical, major, compliance: 0, weight: 0 });
const area = (name, density, { files = 8, kind = 'watch', lift = null } = {}) => ({ name, density, kind, lift, stats: stats(files), dots: [], layers: [] });

let areaSet = { areas: [], files: [], average: 0 };
const FILES = [{ path: 'src/hot/a.py', area: 'hot' }, { path: 'src/hot/b.py', area: 'hot' }, { path: 'src/warm/c.py', area: 'warm' }];
const asked = vi.hoisted(() => ({ selection: undefined }));
vi.mock('../hooks/useMapAreas.js', () => ({
  default: (_p, _s, _active, selection) => { asked.selection = selection; return { areaSet, loading: false, failed: false, unavailable: false }; },
}));

describe('RiskAreasPanel', () => {
  it('lists the areas with their zone and density, and counts both zones', () => {
    areaSet = { areas: [area('hot', 1.4, { kind: 'hotspot' }), area('warm', 0.6), area('calm', 0.1)] };
    render(<RiskAreasPanel project="p" source="local" />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('hot');
    expect(rows[0]).toHaveTextContent(t('overview.riskZoneFixFirst'));
    expect(rows[0]).toHaveTextContent('1.40/f');
    expect(rows[0]).toHaveTextContent(t('map.riskKindHotspot'));
    expect(screen.getByText(t('overview.riskAreasFoot', { areas: '3', fixFirst: 1, watch: 1 }))).toBeInTheDocument();
  });

  it('shows at most the top few', () => {
    areaSet = { areas: Array.from({ length: AREAS_SHOWN + 3 }, (_, i) => area(`a${i}`, 1 + i / 10)) };
    render(<RiskAreasPanel project="p" source="local" />);
    expect(screen.getAllByRole('row')).toHaveLength(AREAS_SHOWN);
  });

  it('a row opens the area\'s findings over every finding, and the foot the whole sky', () => {
    areaSet = { areas: [area('hot', 1.4)], files: FILES };
    const onAreaFindings = vi.fn();
    const onOpenRisk = vi.fn();
    render(<RiskAreasPanel project="p" source="local" onAreaFindings={onAreaFindings} onOpenRisk={onOpenRisk} />);
    fireEvent.click(screen.getByRole('button', { name: t('overview.riskAreaOpenAria', { name: 'hot' }) }));
    expect(onAreaFindings).toHaveBeenCalledWith({ kind: 'area', name: 'hot', paths: ['src/hot/'], small: false });
    fireEvent.click(screen.getByRole('button', { name: t('overview.riskAreasOpen') }));
    expect(onOpenRisk).toHaveBeenCalled();
  });

  it('a row\'s map icon opens the area in the Risk map, never its findings: two sibling buttons, neither inside the other', () => {
    areaSet = { areas: [area('hot', 1.4)], files: FILES };
    const onAreaFindings = vi.fn();
    const onAreaInMap = vi.fn();
    render(<RiskAreasPanel project="p" source="local" onAreaFindings={onAreaFindings} onAreaInMap={onAreaInMap} />);
    const icon = screen.getByRole('button', { name: t('overview.riskAreaInMapAria', { name: 'hot' }) });
    expect(icon).toHaveAttribute('title', t('overview.riskAreaInMap'));
    expect(screen.getAllByRole('row')[0]).not.toHaveAttribute('tabindex');
    expect(icon.closest('.risk-areas-panel__open')).toBeNull();
    fireEvent.click(icon);
    expect(onAreaInMap).toHaveBeenCalledTimes(1);
    expect(onAreaInMap.mock.calls[0][0].name).toBe('hot');
    expect(onAreaFindings).not.toHaveBeenCalled();
  });

  it('has no map icon when the page cannot open the Map', () => {
    areaSet = { areas: [area('hot', 1.4)], files: FILES };
    render(<RiskAreasPanel project="p" source="local" onAreaFindings={vi.fn()} />);
    expect(screen.queryByRole('button', { name: t('overview.riskAreaInMapAria', { name: 'hot' }) })).toBeNull();
  });

  it('says so in one line when no area needs rework', () => {
    areaSet = { areas: [area('calm', 0.1)] };
    render(<RiskAreasPanel project="p" source="local" />);
    expect(screen.queryAllByRole('row')).toHaveLength(0);
    expect(screen.getByText(t('overview.riskAreasNone'))).toBeInTheDocument();
  });

  it('leaves out an area too small to judge, and one the sky does not draw', () => {
    areaSet = { areas: [area('hot', 1.4), area('tiny', 3, { kind: 'small' }), area('few', 2, { files: 2 })] };
    render(<RiskAreasPanel project="p" source="local" />);
    expect(screen.getAllByRole('row').map((r) => r.querySelector('.offending-file-name').textContent)).toEqual(['hot']);
    expect(screen.getByText(t('overview.riskAreasFoot', { areas: '2', fixFirst: 1, watch: 0 }))).toBeInTheDocument();
  });
});

describe('RiskAreasPanel over a dimension', () => {
  it('measures the areas over that dimension, fix first before watch, each with its lift over the dimension\'s average', () => {
    areaSet = { areas: [area('warm', 0.6, { lift: 4 }), area('hot', 0.9, { lift: 1.25 })] };
    render(<RiskAreasPanel project="p" source="local" dimensions={['security']} />);
    expect(asked.selection).toEqual({ dimensions: ['security'], principle: '' });
    const rows = screen.getAllByRole('row');
    expect(rows.map((r) => r.querySelector('.offending-file-name').textContent)).toEqual(['hot', 'warm']);
    expect(rows[1]).toHaveTextContent(t('overview.riskLift', { lift: '4.0' }));
  });

  it('a row opens the area\'s findings over that dimension', () => {
    areaSet = { areas: [area('hot', 0.9, { lift: 2 })], files: FILES };
    const onAreaFindings = vi.fn();
    render(<RiskAreasPanel project="p" source="local" dimensions={['security']} onAreaFindings={onAreaFindings} />);
    fireEvent.click(screen.getByRole('button', { name: t('overview.riskAreaOpenAria', { name: 'hot' }) }));
    expect(onAreaFindings).toHaveBeenCalledWith({ kind: 'area', name: 'hot', paths: ['src/hot/'], small: false, dimensions: ['security'] });
  });

  it('shows no lift over every finding', () => {
    areaSet = { areas: [area('hot', 0.9)] };
    render(<RiskAreasPanel project="p" source="local" />);
    expect(asked.selection).toBeNull();
    expect(screen.queryByText(/avg/)).toBeNull();
  });

  it('lists the healthy areas after the two zones over a dimension, by lift, as its findings seldom reach the lines', () => {
    areaSet = { areas: [area('calm', 0.2, { lift: 6 }), area('quiet', 0.1, { lift: 2 }), area('warm', 0.6, { lift: 1.5 }), area('tiny', 3, { kind: 'small', lift: 9 })] };
    render(<RiskAreasPanel project="p" source="local" dimensions={['security']} />);
    const rows = screen.getAllByRole('row');
    expect(rows.map((r) => r.querySelector('.offending-file-name').textContent)).toEqual(['warm', 'calm', 'quiet']);
    expect(rows[1]).toHaveTextContent(t('overview.riskZoneHealthy'));
    expect(screen.getByText(t('overview.riskAreasFoot', { areas: '4', fixFirst: 0, watch: 1 }))).toBeInTheDocument();
  });
});
