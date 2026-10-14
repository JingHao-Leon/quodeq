import { describe, it, expect } from 'vitest';
import { mapHistoryUrl } from './mapHistory.js';

describe('mapHistoryUrl', () => {
  it('asks for every finding without a selection', () => {
    expect(mapHistoryUrl('p1', 'latest')).toMatch(/\/map\/history\?frames=latest$/);
  });

  it('names the selected dimensions and the principle', () => {
    const url = mapHistoryUrl('p1', 'all', { dimensions: ['reliability', 'security'], principle: 'Fault tolerance' });
    expect(url).toMatch(/\?frames=all&dimensions=reliability%2Csecurity&principle=Fault\+tolerance$/);
  });

  it('leaves the principle out when none is selected', () => {
    expect(mapHistoryUrl('p1', 'latest', { dimensions: ['security'], principle: '' })).not.toMatch(/principle/);
  });
});
