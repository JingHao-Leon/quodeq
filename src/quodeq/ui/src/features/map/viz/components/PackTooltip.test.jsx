import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import PackTooltip from './PackTooltip.jsx';
import { t } from '../../../../strings/index.js';

const at = { current: { x: 0, y: 0 } };
const box = { current: null };
const node = (data) => ({ depth: 1, data: { path: 'src/a.js', severity: {}, ...data } });

describe('PackTooltip', () => {
  it('a circle with no checks shows no rate', () => {
    const { container } = render(<PackTooltip node={node({ violations: 0, compliance: 0 })} mousePos={at} containerRef={box} />);
    expect(container.querySelectorAll('.map-tooltip-row')[2]).toHaveTextContent(`${t('map.rate')}${t('map.rateNone')}`);
  });

  it('a note replaces the numbers', () => {
    const { container } = render(<PackTooltip node={node({ violations: 1, compliance: 1 })} note="Gone" mousePos={at} containerRef={box} />);
    expect(container.querySelector('.map-tooltip')).toHaveTextContent(/^src\/a\.jsGone$/);
  });
});
