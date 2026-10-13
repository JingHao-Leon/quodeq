import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TimelapseBar from './TimelapseBar.jsx';
import { t } from '../../../../strings/index.js';

const RUNS = [
  { day: '2026-08-28', issues: 10, added: 0, fixed: 0 },
  { day: '2026-09-02', issues: 14, added: 6, fixed: 2 },
  { day: '2026-09-20', issues: 12, added: 1, fixed: 3 },
];
const controls = () => ({ toggle: vi.fn(), pause: vi.fn(), first: vi.fn(), latest: vi.fn(), seek: vi.fn(), step: vi.fn(), setSpeed: vi.fn() });
const bar = (over = {}) => ({ data: { runs: RUNS }, position: 1, playing: false, speed: 1, controls: controls(), ...over });

describe('TimelapseBar', () => {
  it('reads out the run shown: date, run N of M, issues and the change', () => {
    render(<TimelapseBar timelapse={bar()} />);
    expect(screen.getByText(/run 2 of 3 · 14 issues \(\+4\)/)).toBeInTheDocument();
  });

  it('the buttons go to the first run, play or pause, and go to the latest run', () => {
    const tl = bar();
    render(<TimelapseBar timelapse={tl} />);
    fireEvent.click(screen.getByRole('button', { name: t('map.timelapseFirst') }));
    fireEvent.click(screen.getByRole('button', { name: t('map.timelapsePlay') }));
    fireEvent.click(screen.getByRole('button', { name: t('map.timelapseLatest') }));
    expect([tl.controls.first, tl.controls.toggle, tl.controls.latest].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('while playing the middle button pauses', () => {
    render(<TimelapseBar timelapse={bar({ playing: true })} />);
    expect(screen.getByRole('button', { name: t('map.timelapsePause') })).toBeInTheDocument();
  });

  it('speed buttons show which speed is on', () => {
    const tl = bar({ speed: 2 });
    render(<TimelapseBar timelapse={tl} />);
    const fast = screen.getByRole('button', { name: t('map.timelapseSpeed', { n: 4 }) });
    expect(screen.getByRole('button', { name: t('map.timelapseSpeed', { n: 2 }) })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(fast);
    expect(tl.controls.setSpeed).toHaveBeenCalledWith(4);
  });

  it('the track is a keyboard slider over the runs', () => {
    const tl = bar();
    render(<TimelapseBar timelapse={tl} />);
    const slider = screen.getByRole('slider', { name: t('map.timelapseTrackAria') });
    expect(slider).toHaveAttribute('aria-valuenow', '2');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    fireEvent.keyDown(slider, { key: 'Home' });
    fireEvent.keyDown(slider, { key: ' ' });
    expect([tl.controls.step.mock.calls[0][0], tl.controls.first.mock.calls.length, tl.controls.toggle.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it('draws nothing before there is a history', () => {
    const { container } = render(<TimelapseBar timelapse={bar({ data: { runs: [] }, position: 0 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a position past the last run shows the last run', () => {
    render(<TimelapseBar timelapse={bar({ position: 5 })} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '3');
  });

  it('hovering a run shows its numbers', () => {
    render(<TimelapseBar timelapse={bar()} />);
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 40 });
    fireEvent.mouseMove(slider, { clientX: 290 });
    expect(screen.getByText(/12 issues · 1 new · 3 fixed/)).toBeInTheDocument();
  });
});

describe('time-lapse bar stylesheet', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../styles/mapTimelapse.css'), 'utf8');
  const rule = (selector) => css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))[1];

  it('gives the readout a fixed width, so the track keeps its size while the readout changes run to run', () => {
    expect(rule('.map-timelapse__info')).toMatch(/flex:\s*none/);
    expect(rule('.map-timelapse__info')).toMatch(/(^|[\s;])width:\s*\d+(\.\d+)?em/);
  });
});
