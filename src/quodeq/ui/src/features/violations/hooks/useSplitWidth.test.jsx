import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useSplitWidth, SPLIT_KEY, DEFAULT_PCT, MIN_PCT, MAX_PCT, KEY_STEP_PCT } from './useSplitWidth.js';
import SplitDivider, { splitColumns } from '../components/SplitDivider.jsx';
import { t } from '../../../strings/index.js';

const BOX = { left: 100, width: 1000, top: 0, height: 500, right: 1100, bottom: 500, x: 100, y: 0 };

function Split() {
  const split = useSplitWidth();
  return (
    <div ref={split.rootRef} data-testid="split" style={splitColumns(split)}>
      <SplitDivider split={split} />
    </div>
  );
}

function renderSplit() {
  const view = render(<Split />);
  vi.spyOn(screen.getByTestId('split'), 'getBoundingClientRect').mockReturnValue(BOX);
  return view;
}

const columns = () => screen.getByTestId('split').style.gridTemplateColumns;
const divider = () => screen.getByRole('slider', { name: t('violations.scopeResize') });
function drag(toX, end = 'pointerup') {
  fireEvent.pointerDown(divider(), { clientX: 560 });
  act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: toX })); });
  act(() => { window.dispatchEvent(new MouseEvent(end)); });
}

describe('useSplitWidth and SplitDivider', () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('opens at the default share, the divider 8px, the detail filling the rest', () => {
    renderSplit();
    expect(columns()).toBe(`${DEFAULT_PCT}% 8px minmax(0, 1fr)`);
  });

  it('drags to the pointer and remembers where it landed', () => {
    renderSplit();
    drag(400);
    expect(columns()).toBe('30% 8px minmax(0, 1fr)');
    expect(localStorage.getItem(SPLIT_KEY)).toBe('30');
  });

  it('clamps the list between 22% and 78%', () => {
    renderSplit();
    drag(0);
    expect(columns()).toBe(`${MIN_PCT}% 8px minmax(0, 1fr)`);
    drag(5000);
    expect(columns()).toBe(`${MAX_PCT}% 8px minmax(0, 1fr)`);
    expect(localStorage.getItem(SPLIT_KEY)).toBe(String(MAX_PCT));
  });

  it('opens at the remembered share, clamped, and ignores what is not a share', () => {
    localStorage.setItem(SPLIT_KEY, '90');
    const { unmount } = renderSplit();
    expect(columns()).toBe(`${MAX_PCT}% 8px minmax(0, 1fr)`);
    unmount();
    localStorage.setItem(SPLIT_KEY, 'wide');
    renderSplit();
    expect(columns()).toBe(`${DEFAULT_PCT}% 8px minmax(0, 1fr)`);
  });

  it('a blocked storage neither breaks the split nor the drag', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderSplit();
    expect(columns()).toBe(`${DEFAULT_PCT}% 8px minmax(0, 1fr)`);
    drag(600);
    expect(columns()).toBe('50% 8px minmax(0, 1fr)');
  });

  it('a cancelled pointer ends the drag and keeps where it was', () => {
    renderSplit();
    drag(400, 'pointercancel');
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900 })); });
    expect(columns()).toBe('30% 8px minmax(0, 1fr)');
    expect(localStorage.getItem(SPLIT_KEY)).toBe('30');
  });

  it('the arrow keys move the focused divider, clamped, and remember it; its value is the list share', () => {
    renderSplit();
    expect(divider()).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(divider(), { key: 'ArrowRight' });
    expect(columns()).toBe(`${DEFAULT_PCT + KEY_STEP_PCT}% 8px minmax(0, 1fr)`);
    expect(divider()).toHaveAttribute('aria-valuenow', String(DEFAULT_PCT + KEY_STEP_PCT));
    expect(localStorage.getItem(SPLIT_KEY)).toBe(String(DEFAULT_PCT + KEY_STEP_PCT));
    for (let i = 0; i < 40; i += 1) fireEvent.keyDown(divider(), { key: 'ArrowLeft' });
    expect(divider()).toHaveAttribute('aria-valuenow', String(MIN_PCT));
    fireEvent.keyDown(divider(), { key: 'Enter' });
    expect(divider()).toHaveAttribute('aria-valuenow', String(MIN_PCT));
  });
});
