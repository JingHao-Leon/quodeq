import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import WorkbenchBar from './WorkbenchBar.jsx';
import { flattenFindings } from './workbenchModel.js';
import { WORKBENCH_DEFAULTS } from './useWorkbenchState.js';
import { makeDims, makeDismissed } from './_workbench.fixtures.js';

const findings = flattenFindings(makeDims(), makeDismissed());
const setup = (stateOver = {}) => {
  const api = { set: vi.fn(), addPath: vi.fn(), removePath: vi.fn(), setPaths: vi.fn() };
  render(<WorkbenchBar findings={findings} state={{ ...WORKBENCH_DEFAULTS, ...stateOver }} {...api}
    dimensions={[['reliability', 3], ['security', 2]]} statusCounts={{ open: 5, dismissed: 1, all: 6 }} />);
  return api;
};

describe('WorkbenchBar', () => {
  it('typing searches', () => {
    const api = setup();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search findings' }), { target: { value: 'key' } });
    expect(api.set).toHaveBeenCalledWith({ q: 'key' });
  });

  it('a path-like query suggests folders and files; picking one adds a chip and clears the text', () => {
    const api = setup({ q: 'src/a' });
    fireEvent.click(screen.getByRole('option', { name: /^src\/a\/\s*3$/ }));
    expect(api.addPath).toHaveBeenCalledWith('src/a/');
    expect(api.set).toHaveBeenCalledWith({ q: '' });
  });

  it('Escape hides the suggestions', () => {
    setup({ q: 'src/a' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search findings' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('the status menu ticks the current value and picks another', async () => {
    const api = setup();
    await userEvent.click(screen.getByRole('button', { name: 'status: open' }));
    expect(screen.getByRole('menuitemradio', { name: /open/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: /dismissed/ }));
    expect(api.set).toHaveBeenCalledWith({ status: 'dismissed' });
  });

  it('each menu button keeps its current value in its name', () => {
    setup({ severity: 'major' });
    expect(screen.getByRole('button', { name: /^severity: major/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^group: none/ })).toBeInTheDocument();
  });

  it('severity counts follow the status filter', async () => {
    setup({ status: 'dismissed' });
    await userEvent.click(screen.getByRole('button', { name: /^severity/ }));
    expect(screen.getByRole('menuitemradio', { name: /critical/ })).toHaveTextContent(/0$/);
    expect(screen.getByRole('menuitemradio', { name: /minor/ })).toHaveTextContent(/1$/);
  });

  it('path chips remove one at a time or all at once', async () => {
    const api = setup({ paths: ['src/a/', 'src/c/z.js'] });
    expect(screen.getByText('path: src/a/')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove src/a/' }));
    expect(api.removePath).toHaveBeenCalledWith('src/a/');
    await userEvent.click(screen.getByRole('button', { name: 'clear' }));
    expect(api.setPaths).toHaveBeenCalledWith([]);
  });
});
