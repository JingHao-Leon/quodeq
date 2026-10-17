import { it, expect, beforeEach, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider } from '../../../api/ApiContext.jsx';
import EvaluationSection from './EvaluationSection.jsx';
import { NEW_FINDINGS_ONLY_KEY } from '../hooks/useLiveFeedSettings.js';

beforeEach(() => { localStorage.clear(); });

// The storage section below the results rows reads its summary through the API.
const api = { getStorage: () => new Promise(() => {}), getCleanStatus: () => new Promise(() => {}) };

function render(ui) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}><ApiProvider value={api}>{ui}</ApiProvider></QueryClientProvider>);
}

it('defaults to New only', () => {
  render(<EvaluationSection />);
  expect(screen.getByRole('tab', { name: 'New only' })).toHaveAttribute('aria-selected', 'true');
});

it('switching to All persists the opt-out', () => {
  render(<EvaluationSection />);
  fireEvent.click(screen.getByRole('tab', { name: 'All' }));
  expect(localStorage.getItem(NEW_FINDINGS_ONLY_KEY)).toBe('false');
  expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
});

it('opens the grade formula editor from its link row', () => {
  const onOpenGradeFormula = vi.fn();
  render(<EvaluationSection onOpenGradeFormula={onOpenGradeFormula} />);
  fireEvent.click(screen.getByRole('button', { name: /grade formula/i }));
  expect(onOpenGradeFormula).toHaveBeenCalledTimes(1);
});

it('the grade formula link row holds only phrasing content', () => {
  render(<EvaluationSection onOpenGradeFormula={vi.fn()} />);
  const button = screen.getByRole('button', { name: /grade formula/i });
  expect(button.querySelector('div')).toBeNull();
});
