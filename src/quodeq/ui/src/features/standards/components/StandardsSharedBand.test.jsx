import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import StandardsSharedBand from './StandardsSharedBand.jsx';
import { t } from '../../../strings/index.js';
import { relativeTimeFine } from '../../../utils/relativeTime.js';

const SYNCED = Date.now() - 4 * 60 * 1000;

describe('StandardsSharedBand', () => {
  it('names the repository and when it last synced', () => {
    render(<StandardsSharedBand host="github.com/quodeq/evaluations" lastSynced={SYNCED} refreshing={false} onPull={vi.fn()} />);
    expect(screen.getByText(t('standards.bandRepository'))).toBeInTheDocument();
    expect(screen.getByText('github.com/quodeq/evaluations')).toBeInTheDocument();
    expect(screen.getByText(`· ${t('standards.bandSynced', { time: relativeTimeFine(SYNCED) })}`)).toBeInTheDocument();
  });

  it('pull calls onPull once', () => {
    const onPull = vi.fn();
    render(<StandardsSharedBand host="h" lastSynced={SYNCED} refreshing={false} onPull={onPull} />);
    fireEvent.click(screen.getByRole('button', { name: t('standards.bandPull') }));
    expect(onPull).toHaveBeenCalledTimes(1);
  });

  it('while refreshing the button reads pulling and does nothing', () => {
    const onPull = vi.fn();
    render(<StandardsSharedBand host="h" lastSynced={SYNCED} refreshing onPull={onPull} />);
    const btn = screen.getByRole('button', { name: t('standards.bandPulling') });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(onPull).not.toHaveBeenCalled();
  });
});
