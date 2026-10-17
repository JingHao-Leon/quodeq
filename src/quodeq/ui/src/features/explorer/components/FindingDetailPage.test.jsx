import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import FindingDetailPage from './FindingDetailPage.jsx';

// The card itself needs the side pane; these tests are about the header.
vi.mock('./EvalCards.jsx', () => ({ EvalViolationCard: () => null }));

const finding = { severity: 'major', title: 'Uncaught exception', file: 'a.py', line: 3, reason: 'r' };

describe('FindingDetailPage trail', () => {
  it('a given trail is the whole trail: dimension and principle are not appended again', () => {
    render(<FindingDetailPage finding={finding} principle="Fault Tolerance" dimension="security"
      crumbs={['history', 'run Sat 11 Oct 02:45', 'security', 'fault tolerance']} />);
    const trail = document.querySelector('.finding-detail-breadcrumb').textContent;
    expect(trail).toBe('history ▸ run Sat 11 Oct 02:45 ▸ security ▸ fault tolerance');
    expect(screen.queryByText('overview')).toBeNull();
  });

  it('without a trail it reads from the Overview, and shows a note when given one', () => {
    render(<FindingDetailPage finding={finding} principle="Fault Tolerance" dimension="security" note="Resolved in the run of X." />);
    expect(document.querySelector('.finding-detail-breadcrumb').textContent).toMatch(/security ▸ fault tolerance$/);
    expect(screen.getByText('Resolved in the run of X.')).toBeInTheDocument();
  });
});
