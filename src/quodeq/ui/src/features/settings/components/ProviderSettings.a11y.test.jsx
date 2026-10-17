import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TimeLimitSetting } from './ProviderSettings.jsx';
import { PROVIDER_SETTING_KEY } from '../../../constants.js';

// The minutes input is named by the row's visible time-limit label.
describe('TimeLimitSetting a11y', () => {
  it.each([
    ['limited', { [PROVIDER_SETTING_KEY.TIME_LIMIT]: '600' }],
    ['unlimited', {}],
  ])('gives the minutes spinbutton the time-limit label as its name when %s', (_mode, state) => {
    render(<TimeLimitSetting state={state} update={vi.fn()} />);
    expect(screen.getByRole('spinbutton')).toHaveAccessibleName('Evaluation time limit');
  });
});
