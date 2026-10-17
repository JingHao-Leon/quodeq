import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import InPlaceUpgradeRow from './InPlaceUpgradeRow.jsx';

const STATUS = { latest: '1.5.0', action_command: 'pipx upgrade quodeq' };
const UPGRADE = {
  supported: true, blocked: false, upgrading: false, installed: false, failed: false,
  error: null, output: '', version: '1.5.0', restarting: false, begin: vi.fn(), restart: vi.fn(),
};

describe('InPlaceUpgradeRow', () => {
  it('shows the command and Install when idle', () => {
    render(<InPlaceUpgradeRow status={STATUS} upgrade={UPGRADE} />);
    expect(screen.getByText('pipx upgrade quodeq')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
  });

  it('folds the tool output under a failed upgrade', () => {
    render(<InPlaceUpgradeRow status={STATUS} upgrade={{ ...UPGRADE, failed: true, error: 'pipx exited with code 1.', output: 'ERROR: disk full' }} />);
    expect(screen.getByText('ERROR: disk full')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('offers Restart now once installed', () => {
    render(<InPlaceUpgradeRow status={STATUS} upgrade={{ ...UPGRADE, installed: true }} />);
    expect(screen.getByRole('button', { name: 'Restart now' })).toBeEnabled();
  });
});
