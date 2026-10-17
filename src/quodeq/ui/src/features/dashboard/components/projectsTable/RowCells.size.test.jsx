import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SizeCell } from './RowCells.jsx';

const MB = 1024 * 1024;

describe('SizeCell', () => {
  it("shows the project's evaluations size from the storage summary", () => {
    const { container } = render(<SizeCell stored={{ bytes: 62 * MB, runs: 23, archived: 4 }} />);

    expect(container.querySelector('.projects-row__size').textContent).toBe('62.0 MB');
  });

  it('shows the empty-cell dash when the size is unknown (not loaded, or a remote project)', () => {
    const { container } = render(<SizeCell stored={null} />);

    expect(container.querySelector('.projects-row__size').textContent).toBe('–');
  });
});
