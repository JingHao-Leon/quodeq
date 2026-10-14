import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TimelapseBar, { MIN_TICK_GAP_PX, TRACK_FALLBACK_PX } from './TimelapseBar.jsx';
import { t, LOCALE } from '../../../../strings/index.js';
import { formatShortDate } from '../../../../utils/formatters.js';
import { dayDate, runX } from '../core/timelapseBarModel.js';

const RUNS = [
  { day: '2026-08-28', issues: 10, added: 0, fixed: 0 },
  { day: '2026-09-02', issues: 14, added: 6, fixed: 2 },
  { day: '2026-09-20', issues: 12, added: 1, fixed: 3 },
];
const controls = () => ({ toggle: vi.fn(), first: vi.fn(), latest: vi.fn(), seek: vi.fn(), step: vi.fn(), setSpeed: vi.fn() });
const bar = (over = {}) => ({ data: { runs: RUNS }, position: 1, playing: false, speed: 1, controls: controls(), ...over });
const shortDate = (day) => formatShortDate(dayDate(day).toISOString());
/** The one button that opens the period and speed choices (named after what is on). */
const settingsButton = () => document.querySelector('.map-timelapse__settings-btn');
const menu = () => document.querySelector('.map-timelapse__menu');

describe('TimelapseBar', () => {
  it('reads out the run shown in two lines: its date, then N of M, issues and the change', () => {
    const { container } = render(<TimelapseBar timelapse={bar()} />);
    expect(container.querySelector('.map-timelapse__when')).toHaveTextContent(shortDate('2026-09-02'));
    expect(container.querySelector('.map-timelapse__count')).toHaveTextContent(/^2 of 3 · 14 issues \(\+4\)$/);
  });

  it('the transport goes to the first run, one back, plays or pauses, one forward, and to the latest run', () => {
    const tl = bar();
    render(<TimelapseBar timelapse={tl} />);
    const keys = ['map.timelapseFirst', 'map.timelapseStepBack', 'map.timelapsePlay', 'map.timelapseStepForward', 'map.timelapseLatest'];
    keys.forEach((key) => fireEvent.click(screen.getByRole('button', { name: t(key) })));
    expect([tl.controls.first, tl.controls.toggle, tl.controls.latest].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    expect(tl.controls.step.mock.calls).toEqual([[-1], [1]]);
  });

  it('while playing the middle button pauses', () => {
    render(<TimelapseBar timelapse={bar({ playing: true })} />);
    expect(screen.getByRole('button', { name: t('map.timelapsePause') })).toBeInTheDocument();
  });

  it('the settings show which speed is on, and pick another', () => {
    const tl = bar({ speed: 2 });
    render(<TimelapseBar timelapse={tl} />);
    fireEvent.click(settingsButton());
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

describe('TimelapseBar frames by period', () => {
  // Two weekly frames: each the week's last run, named after the week's first day.
  const WEEKS = [
    { day: '2026-09-13', firstDay: '2026-09-07', issues: 10, added: 3, fixed: 1 },
    { day: '2026-09-16', firstDay: '2026-09-14', issues: 12, added: 2, fixed: 0 },
  ];
  const byPeriod = (period, over = {}) => bar({ frames: { runs: WEEKS, position: 0, period, setPeriod: vi.fn() }, ...over });
  const when = () => document.querySelector('.map-timelapse__when').textContent;

  it('a week frame reads as the week of its first day, a month frame as its month', () => {
    const { rerender } = render(<TimelapseBar timelapse={byPeriod('week')} />);
    expect(when()).toBe(t('map.timelapseWeekOf', { date: shortDate('2026-09-07') }));
    rerender(<TimelapseBar timelapse={byPeriod('month')} />);
    expect(when()).toBe(new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' }).format(dayDate('2026-09-13')));
  });

  it('the track counts frames, not runs, and its played tint ends at the frame shown', () => {
    const { container } = render(<TimelapseBar timelapse={byPeriod('week', { data: { runs: RUNS } })} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '2');
    expect(container.querySelector('.map-timelapse__played')).toHaveAttribute('width', String(runX(0, WEEKS.length)));
  });

  it('the settings button names the period and speed on, and opens Play by and the speed', () => {
    const tl = byPeriod('week');
    render(<TimelapseBar timelapse={tl} />);
    const summary = t('map.timelapseSettingsSummary', { period: t('map.timelapsePeriodWeek'), speed: t('map.timelapseSpeed', { n: 1 }) });
    expect(settingsButton()).toHaveAttribute('aria-label', t('map.timelapseSettingsAria', { summary }));
    fireEvent.click(settingsButton());
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: t('map.timelapsePeriodWeek') })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: t('map.timelapsePeriodMonth') }));
    expect(tl.frames.setPeriod).toHaveBeenCalledWith('month');
  });

  it('Escape or a press outside closes the settings; a press inside keeps them open', () => {
    render(<TimelapseBar timelapse={byPeriod('day')} />);
    fireEvent.click(settingsButton());
    fireEvent.mouseDown(menu());
    expect(menu()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu()).toBeNull();
    fireEvent.click(settingsButton());
    fireEvent.mouseDown(document.body);
    expect(menu()).toBeNull();
  });

  it('a bare history (no period setter) plays by day and offers the speed only', () => {
    render(<TimelapseBar timelapse={bar()} />);
    fireEvent.click(settingsButton());
    expect(screen.queryByRole('button', { name: t('map.timelapsePeriodDay') })).toBeNull();
    expect(screen.getByRole('group', { name: t('map.timelapseSpeedAria') })).toBeInTheDocument();
  });
});

describe('TimelapseBar track labels', () => {
  const tipAt = (clientX) => {
    render(<TimelapseBar timelapse={bar()} />);
    const slider = screen.getByRole('slider');
    slider.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 40 });
    fireEvent.mouseMove(slider, { clientX });
    return document.querySelector('.map-timelapse__tip').style;
  };

  it('the run tooltip shifts by its own share of the track, so it stays inside at both ends', () => {
    for (const clientX of [1, 299]) {
      const { left, transform } = tipAt(clientX);
      expect(transform).toBe(`translateX(-${left})`);
      cleanup();
    }
  });

  it('on a long history the month labels are thinned so neighbours never overlap', () => {
    const monthly = Array.from({ length: 48 }, (_, m) => ({
      day: `${2022 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-01`, issues: m, added: 0, fixed: 0,
    }));
    const { container } = render(<TimelapseBar timelapse={bar({ data: { runs: monthly }, position: 0 })} />);
    const lefts = [...container.querySelectorAll('.map-timelapse__tick')].map((el) => parseFloat(el.style.left));
    const gapsPx = lefts.slice(1).map((x, i) => ((x - lefts[i]) / 100) * TRACK_FALLBACK_PX);
    expect(lefts.length).toBeGreaterThan(1);
    expect(Math.min(...gapsPx)).toBeGreaterThanOrEqual(MIN_TICK_GAP_PX);
  });
});

describe('time-lapse bar stylesheet', () => {
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../styles/mapTimelapse.css'), 'utf8');
  const rule = (selector) => css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))[1];

  it('gives the readout a fixed width, so the track keeps its size while the readout changes run to run', () => {
    expect(rule('.map-timelapse__readout')).toMatch(/flex:\s*none/);
    expect(rule('.map-timelapse__readout')).toMatch(/(^|[\s;])width:\s*\d+(\.\d+)?em/);
  });
});
