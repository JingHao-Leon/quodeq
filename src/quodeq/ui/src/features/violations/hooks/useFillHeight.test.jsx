import { describe, it, expect } from 'vitest';
import { useRef } from 'react';
import { render } from '@testing-library/react';
import { FILL_VAR, fillHeightOf, useFillHeight } from './useFillHeight.js';

/** A scroller of `height` (padded `pad` at the bottom) holding a split whose top sits `top` below the scroller's. */
function layout({ height, pad, top, scrolled = 0 }) {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  scroller.style.paddingBottom = `${pad}px`;
  Object.defineProperty(scroller, 'clientHeight', { value: height });
  scroller.scrollTop = scrolled;
  scroller.getBoundingClientRect = () => ({ top: 40 });
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ top: 40 + top - scrolled });
  scroller.appendChild(el);
  document.body.appendChild(scroller);
  return { scroller, el };
}

describe('useFillHeight', () => {
  it('measures the room from the split down to the scroller\'s bottom padding, wherever the page is scrolled', () => {
    expect(fillHeightOf(layout({ height: 750, pad: 32, top: 117 }).el)).toBe(601);
    expect(fillHeightOf(layout({ height: 750, pad: 32, top: 117, scrolled: 50 }).el)).toBe(601);
  });

  it('has nothing to measure outside a scroller', () => {
    expect(fillHeightOf(document.createElement('div'))).toBeNull();
  });

  it('sets the measured height on the element as a CSS variable', () => {
    const { scroller } = layout({ height: 750, pad: 32, top: 0 });
    function Split() {
      const ref = useRef(null);
      useFillHeight(ref);
      return <div ref={ref} data-testid="split" />;
    }
    const { getByTestId } = render(<Split />, { container: scroller });
    expect(getByTestId('split').style.getPropertyValue(FILL_VAR)).toMatch(/px$/);
  });
});
