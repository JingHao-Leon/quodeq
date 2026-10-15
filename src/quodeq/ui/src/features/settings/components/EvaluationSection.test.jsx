import { it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import EvaluationSection from './EvaluationSection.jsx';
import { NEW_FINDINGS_ONLY_KEY } from '../hooks/useLiveFeedSettings.js';

beforeEach(() => { localStorage.clear(); });

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
