import { it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ToolbarSection from './ToolbarSection.jsx';

beforeEach(() => { localStorage.clear(); });

it('holds the assistant and terminal switches under one Toolbar header', () => {
  render(<ToolbarSection />);
  expect(screen.getByText('Toolbar')).toBeInTheDocument();
  expect(screen.getByText(/enable assistant/i)).toBeInTheDocument();
  expect(screen.getByText(/enable terminal/i)).toBeInTheDocument();
});

it('turning the assistant off persists the opt-out', () => {
  render(<ToolbarSection />);
  const offs = screen.getAllByRole('tab', { name: 'Off' });
  fireEvent.click(offs[0]);
  expect(localStorage.getItem('cc-assistant-enabled')).toBe('false');
});
