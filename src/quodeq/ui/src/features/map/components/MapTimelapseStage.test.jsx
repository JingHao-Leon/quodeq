import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MapTimelapseStage, { STAGE_FADE_MS } from './MapTimelapseStage.jsx';

afterEach(() => { vi.useRealTimers(); });

const DATA = { runs: [{}, {}, {}, {}] };
const LATEST = 3;
const timelapse = (position, over = {}) => ({ data: DATA, project: 'p1', position, past: position < LATEST, ...over });
const renderPast = (tl) => <span data-testid="then" data-position={tl.position}>then</span>;
const stage = (tl) => <MapTimelapseStage timelapse={tl} latest={<span>latest</span>} renderPast={renderPast} />;
const pastLayer = (container) => container.querySelector('.map-stage__layer--past');
const shownRun = (container) => container.querySelector('[data-testid="then"]').dataset.position;

describe('MapTimelapseStage', () => {
  it('mounts no past layer before a past run is shown', () => {
    const { container } = render(stage(timelapse(LATEST)));
    expect(pastLayer(container)).toBeNull();
  });

  it('keeps the past layer mounted, hidden, long after returning to the latest', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(stage(timelapse(1)));
    rerender(stage(timelapse(LATEST)));
    act(() => { vi.advanceTimersByTime(STAGE_FADE_MS * 10); });
    expect(pastLayer(container)).toHaveClass('is-hidden');
    expect(container.querySelector('.map-stage__layer:not(.map-stage__layer--past)')).not.toHaveClass('is-hidden');
  });

  it('while hidden the past view holds the run it last showed, so the latest run costs it no work', () => {
    const { container, rerender } = render(stage(timelapse(1)));
    rerender(stage(timelapse(LATEST)));
    expect(shownRun(container)).toBe('1');
    rerender(stage(timelapse(2)));
    expect(shownRun(container)).toBe('2');
  });

  it('a new history while hidden drops the past layer instead of rebuilding it out of sight', () => {
    const { container, rerender } = render(stage(timelapse(1)));
    rerender(stage(timelapse(LATEST)));
    rerender(stage(timelapse(LATEST, { data: { runs: [...DATA.runs] } })));
    expect(pastLayer(container)).toBeNull();
  });

  it('another project drops the past layer', () => {
    const { container, rerender } = render(stage(timelapse(1)));
    rerender(stage(timelapse(LATEST, { project: 'p2' })));
    expect(pastLayer(container)).toBeNull();
  });

  it('sets the fade length on the stage from STAGE_FADE_MS', () => {
    const { container } = render(stage(timelapse(LATEST)));
    expect(container.querySelector('.map-stage').style.getPropertyValue('--map-stage-fade')).toBe(`${STAGE_FADE_MS}ms`);
  });
});

describe('the stage stylesheet', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../styles/mapTimelapse.css'), 'utf8');
  // A rule's body by its exact selector, found as plain text (no pattern built from the selector).
  const rule = (selector) => {
    const start = css.indexOf(`${selector} {`);
    return start < 0 ? '' : css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  };

  it('today\'s layer never fades: hidden, it stays opaque under the past layer (no dim dip mid-swap)', () => {
    expect(rule('.map-stage__layer:not(.map-stage__layer--past).is-hidden')).toMatch(/opacity:\s*1\b/);
  });

  it('the past layer is opaque, so it fades in and out over today\'s', () => {
    expect(rule('.map-stage__layer--past')).toMatch(/background:\s*var\(--color-surface\)/);
  });
});
