import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RemoteEvaluatePanel from './RemoteEvaluatePanel.jsx';

function remotePull(overrides = {}) {
  return {
    pullingId: null, pullError: null, pullConflictId: null,
    start: vi.fn(), confirmCopy: vi.fn(), cancelConflict: vi.fn(),
    ...overrides,
  };
}

function renderPanel(pull) {
  render(<RemoteEvaluatePanel projectId="remote-1" projectName="site" remotePull={pull} />);
}

describe('RemoteEvaluatePanel', () => {
  it('says why a remote project needs a local copy and pulls one', () => {
    const pull = remotePull();
    renderPanel(pull);
    expect(screen.getByRole('heading', { name: 'site is a remote project' })).toBeInTheDocument();
    expect(screen.getByText('bring the code and its history here.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'pull local copy' }));
    expect(pull.start).toHaveBeenCalledWith('remote-1');
  });

  it('shows the download while it runs, with the button disabled', () => {
    renderPanel(remotePull({ pullingId: 'remote-1' }));
    expect(screen.getByText('downloading…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pulling…' })).toBeDisabled();
  });

  it('waits while another project pulls', () => {
    renderPanel(remotePull({ pullingId: 'other' }));
    expect(screen.getByRole('button', { name: 'pull local copy' })).toBeDisabled();
  });

  it('shows a failure with its reason and retries', () => {
    const pull = remotePull({ pullError: { projectId: 'remote-1', message: 'no network' } });
    renderPanel(pull);
    expect(screen.getByRole('alert')).toHaveTextContent('no network');
    fireEvent.click(screen.getByRole('button', { name: 'try again' }));
    expect(pull.start).toHaveBeenCalledWith('remote-1');
  });

  it('asks before pulling over a local project of the same name', () => {
    const pull = remotePull({ pullConflictId: 'remote-1' });
    renderPanel(pull);
    fireEvent.click(screen.getByRole('button', { name: 'pull as a copy' }));
    expect(pull.confirmCopy).toHaveBeenCalledWith('remote-1');
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(pull.cancelConflict).toHaveBeenCalledWith('remote-1');
  });
});
