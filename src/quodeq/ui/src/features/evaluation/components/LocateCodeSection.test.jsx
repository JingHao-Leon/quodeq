import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LocateCodeSection from './LocateCodeSection.jsx';
import { withQueryClient } from '../../../test-utils/withQueryClient.jsx';

const browseFolder = vi.fn();
vi.mock('../../dashboard/hooks/useFolderPicker.jsx', () => ({
  useFolderPicker: () => ({ browseFolder, picker: null }),
}));

const PULLED = { path: '/Users/publisher/code/site', originUrl: 'https://github.com/org/site' };

function renderSection(info, relocate) {
  const Wrapper = withQueryClient();
  render(<Wrapper><LocateCodeSection info={info} relocate={relocate} /></Wrapper>);
}

describe('LocateCodeSection', () => {
  beforeEach(() => { browseFolder.mockReset(); });

  it('says where it looked and points the project at the folder the person picks', async () => {
    const relocate = vi.fn().mockResolvedValue(undefined);
    browseFolder.mockResolvedValue('/Users/me/site');
    renderSection(PULLED, relocate);
    expect(screen.getByText(/can't find this project's code at \/Users\/publisher\/code\/site/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'choose folder' }));
    await waitFor(() => expect(relocate).toHaveBeenCalledWith('/Users/me/site'));
  });

  it('does nothing when the picker is closed', async () => {
    const relocate = vi.fn();
    browseFolder.mockResolvedValue(null);
    renderSection(PULLED, relocate);
    fireEvent.click(screen.getByRole('button', { name: 'choose folder' }));
    await waitFor(() => expect(browseFolder).toHaveBeenCalled());
    expect(relocate).not.toHaveBeenCalled();
  });

  it('clones from the repository URL when the project knows it', async () => {
    const relocate = vi.fn().mockResolvedValue(undefined);
    renderSection(PULLED, relocate);
    expect(screen.getByText(/clone https:\/\/github.com\/org\/site when the evaluation starts/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'clone it instead' }));
    await waitFor(() => expect(relocate).toHaveBeenCalledWith('https://github.com/org/site'));
  });

  it('offers no clone without a URL', () => {
    renderSection({ path: null, originUrl: null }, vi.fn());
    expect(screen.getByText(/doesn't know where this project's code is/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'clone it instead' })).not.toBeInTheDocument();
  });

  it('shows why a location was refused', async () => {
    const relocate = vi.fn().mockRejectedValue({ status: 400, code: 'INVALID_INPUT' });
    browseFolder.mockResolvedValue('/nope');
    renderSection(PULLED, relocate);
    fireEvent.click(screen.getByRole('button', { name: 'choose folder' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
