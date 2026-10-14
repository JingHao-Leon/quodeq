import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import PackTooltip from './PackTooltip.jsx';
import { t } from '../../../../strings/index.js';

const node = (data) => ({ depth: 1, data: { path: 'src/a.js', severity: {}, ...data } });

describe('PackTooltip', () => {
  it('a circle with no checks shows no rate', () => {
    const { container } = render(<PackTooltip node={node({ violations: 0, compliance: 0 })} />);
    expect(container.querySelectorAll('.map-tooltip-row')[2]).toHaveTextContent(`${t('map.rate')}${t('map.rateNone')}`);
  });

  it('the title is the circle\'s own name, its path on the line under it', () => {
    const { container } = render(<PackTooltip node={node({ violations: 1, compliance: 1 })} />);
    expect(container.querySelector('.map-tooltip-title')).toHaveTextContent(/^a\.js$/);
    expect(container.querySelector('.map-tooltip-path')).toHaveTextContent(/^src\/a\.js$/);
  });
});
