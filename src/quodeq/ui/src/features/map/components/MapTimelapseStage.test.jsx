import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MapTimelapseStage, { STAGE_FADE_MS } from './MapTimelapseStage.jsx';

afterEach(() => { vi.useRealTimers(); });

const stage = (past) => <MapTimelapseStage past={past} latest={<span>latest</span>} pastView={<span>then</span>} />;
const pastLayer = (container) => container.querySelector('.map-stage__layer--past');

describe('MapTimelapseStage', () => {
  it('mounts no past layer before a past run is shown', () => {
    const { container } = render(stage(false));
    expect(pastLayer(container)).toBeNull();
  });

  it('keeps the past layer mounted, hidden, long after returning to the latest', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(stage(true));
    rerender(stage(false));
    act(() => { vi.advanceTimersByTime(STAGE_FADE_MS * 10); });
    expect(pastLayer(container)).toHaveClass('is-hidden');
    expect(container.querySelector('.map-stage__layer:not(.map-stage__layer--past)')).not.toHaveClass('is-hidden');
  });

  it('sets the fade length on the stage from STAGE_FADE_MS', () => {
    const { container } = render(stage(false));
    expect(container.querySelector('.map-stage').style.getPropertyValue('--map-stage-fade')).toBe(`${STAGE_FADE_MS}ms`);
  });
});
