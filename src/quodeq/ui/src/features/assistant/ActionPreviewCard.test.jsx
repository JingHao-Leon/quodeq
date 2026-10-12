import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ActionPreviewCard } from './ActionPreviewCard.jsx';

vi.mock('../../api/assistant.js', () => ({
  applyAssistantAction: vi.fn(async () => ({ applied: true })),
  rejectAssistantAction: vi.fn(async () => ({ status: 'rejected' })),
}));
import { applyAssistantAction, rejectAssistantAction } from '../../api/assistant.js';

// Each test that listens for the applied event registers through this helper;
// the afterEach below removes whatever is still registered.
const appliedListeners = [];
function listenForApplied() {
  const events = [];
  const handler = (e) => events.push(e);
  window.addEventListener('quodeq:assistant-action-applied', handler);
  appliedListeners.push(handler);
  return events;
}
afterEach(() => {
  for (const handler of appliedListeners.splice(0)) {
    window.removeEventListener('quodeq:assistant-action-applied', handler);
  }
});


const outline = [
  { name: 'Errors', requirements: [
    { id: 'ERR-1', text: 'Error bodies follow RFC7807' },
    { id: 'ERR-2', text: 'Every error carries a type URI' },
  ] },
  { name: 'Status codes', requirements: [{ id: 'ST-1', text: 'Validation failures return 422' }] },
  { name: 'Logging', requirements: [{ id: 'LOG-1', text: 'Errors are logged once at the boundary' }] },
];
const action = { actionId: 'a1', actionType: 'create_standard',
  summary: { id: 'rfc7807', name: 'RFC7807 Errors', principleCount: 3, principles: outline } };

beforeEach(() => vi.clearAllMocks());

it('renders the canonical summary, not raw markdown', () => {
  render(<ActionPreviewCard action={action} />);
  expect(screen.getByText('RFC7807 Errors')).toBeInTheDocument();
  expect(screen.getByText(/3 principles/i)).toBeInTheDocument();
});

it('shows every principle with its requirement ids and texts so the draft can be reviewed', () => {
  render(<ActionPreviewCard action={action} />);
  expect(screen.getByText('Errors')).toBeInTheDocument();
  expect(screen.getByText('Status codes')).toBeInTheDocument();
  expect(screen.getByText('ERR-2')).toBeInTheDocument();
  expect(screen.getByText('Every error carries a type URI')).toBeInTheDocument();
  expect(screen.getByText('Errors are logged once at the boundary')).toBeInTheDocument();
});

it('collapses a principle on click and expands it again', () => {
  render(<ActionPreviewCard action={action} />);
  fireEvent.click(screen.getByRole('button', { name: /Errors/ }));
  expect(screen.queryByText('Error bodies follow RFC7807')).not.toBeInTheDocument();
  expect(screen.getByText('Validation failures return 422')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Errors/ }));
  expect(screen.getByText('Error bodies follow RFC7807')).toBeInTheDocument();
});

it('renders a create_standard summary without an outline (older drafts)', () => {
  render(<ActionPreviewCard action={{ actionId: 'a0', actionType: 'create_standard',
    summary: { id: 'old', name: 'Old Draft', principleCount: 2 } }} />);
  expect(screen.getByText('Old Draft')).toBeInTheDocument();
  expect(screen.getByText(/2 principles/i)).toBeInTheDocument();
});

it('apply calls the endpoint and shows applied', async () => {
  render(<ActionPreviewCard action={action} />);
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));
  await waitFor(() => expect(applyAssistantAction).toHaveBeenCalledWith('a1'));
  expect(await screen.findByText(/applied/i)).toBeInTheDocument();
});

it('reject calls the endpoint and shows rejected', async () => {
  render(<ActionPreviewCard action={action} />);
  fireEvent.click(screen.getByRole('button', { name: /reject/i }));
  await waitFor(() => expect(rejectAssistantAction).toHaveBeenCalledWith('a1'));
  expect(await screen.findByText(/rejected/i)).toBeInTheDocument();
});

it('renders a dismiss_finding summary', () => {
  render(<ActionPreviewCard action={{ actionId: 'a1', actionType: 'dismiss_finding',
    summary: { req: 'r1', file: 'a.py', line: 3, reason: 'guarded above' } }} />);
  expect(screen.getByText('Dismiss finding')).toBeInTheDocument();
  expect(screen.getByText(/r1 · a\.py:3/)).toBeInTheDocument();
  expect(screen.getByText('guarded above')).toBeInTheDocument();
});

it('renders a verify_finding summary', () => {
  render(<ActionPreviewCard action={{ actionId: 'a2', actionType: 'verify_finding',
    summary: { req: 'r1', file: 'a.py', line: 3, note: 'real, unsanitized input' } }} />);
  expect(screen.getByText('Mark finding as verified')).toBeInTheDocument();
  expect(screen.getByText('real, unsanitized input')).toBeInTheDocument();
});

it('dispatches quodeq:assistant-action-applied on successful apply', async () => {
  const events = listenForApplied();
  const dismissAction = { actionId: 'a3', actionType: 'dismiss_finding',
    summary: { req: 'r1', file: 'a.py', line: 3, reason: 'fp' } };
  render(<ActionPreviewCard action={dismissAction} />);
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));
  await waitFor(() => expect(applyAssistantAction).toHaveBeenCalledWith('a3'));
  await waitFor(() => expect(events.length).toBe(1));
  expect(events[0].detail.actionType).toBe('dismiss_finding');
});

it('includes the scores and delta from the apply response in the dispatched event', async () => {
  const events = listenForApplied();
  const scores = { dimensions: [{ dimension: 'security', overallScore: 80 }] };
  const delta = {
    kind: 'dismiss', dismissed: { req: 'R1', file: 'a.py', line: 3 },
    runId: 'run1', isLatest: false, accumulated: null,
  };
  applyAssistantAction.mockResolvedValueOnce({ applied: true, result: { dismissed: true, scores, delta } });
  const dismissAction = { actionId: 'a4', actionType: 'dismiss_finding',
    summary: { req: 'R1', file: 'a.py', line: 3, reason: 'fp' } };
  render(<ActionPreviewCard action={dismissAction} />);
  fireEvent.click(screen.getByRole('button', { name: /apply/i }));
  await waitFor(() => expect(applyAssistantAction).toHaveBeenCalledWith('a4'));
  await waitFor(() => expect(events.length).toBe(1));
  expect(events[0].detail.delta).toEqual(delta);
  expect(events[0].detail.scores).toEqual(scores);
});
