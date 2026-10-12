import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RefreshError } from './ProjectRow.jsx';

describe('RefreshError', () => {
  it("shows git's own output under the sentence, not only on hover", () => {
    render(<RefreshError refresh={{ error: 'Could not fetch from the remote.', errorDetail: 'fatal: repository not found' }} />);

    expect(screen.getByRole('alert').textContent).toContain('Could not fetch from the remote.');
    expect(screen.getByText('fatal: repository not found')).toBeTruthy();
  });

  it('shows the sentence alone when git said nothing', () => {
    render(<RefreshError refresh={{ error: 'Could not update the code.', errorDetail: null }} />);

    expect(screen.getByRole('alert').textContent).toBe('Could not update the code.');
  });
});
