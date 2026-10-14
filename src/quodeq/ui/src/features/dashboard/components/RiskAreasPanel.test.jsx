import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RiskAreasPanel, { areasNeedingRework, AREAS_SHOWN } from './RiskAreasPanel.jsx';
import { t } from '../../../strings/index.js';

const stats = (files, violations = 3, critical = 0, major = 1) => ({ files, violations, critical, major, compliance: 0, weight: 0 });
const area = (name, density, { files = 8, kind = 'watch' } = {}) => ({ name, density, kind, stats: stats(files), dots: [], layers: [] });

let areaSet = { areas: [], files: [], average: 0 };
vi.mock('../../map/hooks/useMapAreas.js', () => ({
  default: () => ({ areaSet, loading: false, failed: false, unavailable: false }),
}));

describe('areasNeedingRework', () => {
  it('keeps fix first and watch, most weighted issues per file first, and leaves small areas out', () => {
    const rows = areasNeedingRework({ areas: [area('calm', 0.2), area('hot', 1.4), area('warm', 0.6), area('tiny', 3, { files: 2 })] });
    expect(rows.map((r) => [r.area.name, r.zone])).toEqual([['hot', 'fixFirst'], ['warm', 'watch']]);
  });
});

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
});
