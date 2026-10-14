import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RiskAreasPanel, { AREAS_SHOWN } from './RiskAreasPanel.jsx';
import { t } from '../../../strings/index.js';

const stats = (files, violations = 3, critical = 0, major = 1) => ({ files, violations, critical, major, compliance: 0, weight: 0 });
const area = (name, density, { files = 8, kind = 'watch', lift = null } = {}) => ({ name, density, kind, lift, stats: stats(files), dots: [], layers: [] });

let areaSet = { areas: [], files: [], average: 0 };
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

  it('opens an area, and the whole sky from the foot', () => {
    areaSet = { areas: [area('hot', 1.4)] };
    const onAreaClick = vi.fn();
    const onOpenRisk = vi.fn();
    render(<RiskAreasPanel project="p" source="local" onAreaClick={onAreaClick} onOpenRisk={onOpenRisk} />);
    fireEvent.click(screen.getAllByRole('row')[0]);
    expect(onAreaClick.mock.calls[0][0].name).toBe('hot');
    fireEvent.click(screen.getByRole('button', { name: t('overview.riskAreasOpen') }));
    expect(onOpenRisk).toHaveBeenCalled();
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

  it('shows no lift over every finding', () => {
    areaSet = { areas: [area('hot', 0.9)] };
    render(<RiskAreasPanel project="p" source="local" />);
    expect(asked.selection).toBeNull();
    expect(screen.queryByText(/this dimension's avg/)).toBeNull();
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
