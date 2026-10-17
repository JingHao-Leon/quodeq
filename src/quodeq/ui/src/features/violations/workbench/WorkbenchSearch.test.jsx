import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import WorkbenchSearch from './WorkbenchSearch.jsx';
import { flattenFindings } from './workbenchModel.js';
import { makeDims } from './_workbench.fixtures.js';

const findings = flattenFindings(makeDims(), []);
const setup = (q = 'src/a') => {
  const api = { onQuery: vi.fn(), onPickPath: vi.fn() };
  render(<WorkbenchSearch findings={findings} q={q} {...api} />);
  return { ...api, box: screen.getByRole('textbox', { name: 'Search findings' }) };
};

describe('WorkbenchSearch path suggestions', () => {
  it('a click on an option picks it', () => {
    const api = setup();
    fireEvent.click(screen.getByRole('option', { name: /^src\/a\/\s*3$/ }));
    expect(api.onPickPath).toHaveBeenCalledWith('src/a/');
    expect(api.onQuery).toHaveBeenCalledWith('');
  });

  it('leaving the input closes the suggestions', () => {
    const { box } = setup();
    fireEvent.blur(box);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a click outside closes the suggestions', () => {
    setup();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('↓ and ↑ move the active option, named on the input', () => {
    const { box } = setup();
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    const [first, second] = screen.getAllByRole('option');
    expect(box).toHaveAttribute('aria-activedescendant', first.id);
    expect(first).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveAttribute('aria-activedescendant', second.id);
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box).toHaveAttribute('aria-activedescendant', first.id);
    expect(second).toHaveAttribute('aria-selected', 'false');
  });

  it('Enter picks the active option', () => {
    const api = setup();
    fireEvent.keyDown(api.box, { key: 'ArrowDown' });
    fireEvent.keyDown(api.box, { key: 'Enter' });
    expect(api.onPickPath).toHaveBeenCalledWith('src/a/');
  });

  it('Enter with no active option picks nothing, Escape closes', () => {
    const api = setup();
    fireEvent.keyDown(api.box, { key: 'Enter' });
    expect(api.onPickPath).not.toHaveBeenCalled();
    fireEvent.keyDown(api.box, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(api.box).not.toHaveAttribute('aria-activedescendant');
  });
});
