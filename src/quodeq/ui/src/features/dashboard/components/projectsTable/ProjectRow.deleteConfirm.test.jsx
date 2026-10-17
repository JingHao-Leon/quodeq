import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DeleteConfirm } from './ProjectRow.jsx';

const MB = 1024 * 1024;

function renderConfirm(props) {
  const onDelete = vi.fn();
  const setConfirming = vi.fn();
  const view = render(<DeleteConfirm id="growstuff" onDelete={onDelete} setConfirming={setConfirming} {...props} />);
  return { ...view, onDelete, setConfirming, text: () => view.container.querySelector('span').textContent };
}

describe('DeleteConfirm', () => {
  it('says how many runs and how much space go, and that the repository stays', () => {
    const { text } = renderConfirm({ stored: { bytes: 62 * MB, runs: 23, archived: 0 }, runsCount: 5 });

    expect(text()).toBe('Delete its 23 runs and 62.0 MB of evaluations? The repository itself is not touched.');
  });

  it("falls back to the project's run count when the summary has none", () => {
    const { text } = renderConfirm({ stored: { bytes: 2 * MB }, runsCount: 5 });

    expect(text()).toContain('Delete its 5 runs and 2.0 MB');
  });

  it('asks the plain question while the size is unknown', () => {
    const { text } = renderConfirm({ stored: null, runsCount: 5 });

    expect(text()).toBe('Delete?');
  });

  it('deletes the project on yes and closes the confirm', () => {
    const { container, onDelete, setConfirming } = renderConfirm({ stored: null, runsCount: 5 });

    fireEvent.click(container.querySelector('.projects-row__btn--danger'));
    expect(onDelete).toHaveBeenCalledWith('growstuff');
    expect(setConfirming).toHaveBeenCalledWith(null);
  });
});
