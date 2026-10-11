import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { RunHeroSection } from './RunOverviewPanel.jsx';

const baseSummary = {
  overallGrade: 'Adequate',
  numericAverage: '6.0',
  totalViolations: 131,
  totalCompliance: 175,
  dimensionCount: 1,
  severity: { critical: 0, major: 11, minor: 120 },
  dismissed: 0,
  suppressed: 0,
};

const dashboard = { selectedRun: { runId: 'r1', dateLabel: '4 Jul 2026' } };

describe('RunHeroSection suppressed note', () => {
  it('shows how many findings the suppression filters hid', () => {
    render(
      <RunHeroSection
        dashboard={dashboard}
        selectedRunId="r1"
        runSummary={{ ...baseSummary, suppressed: 404 }}
      />,
    );
    expect(screen.getByText(/404 suppressed/)).toBeTruthy();
  });

  it('renders no note when nothing was suppressed', () => {
    render(
      <RunHeroSection
        dashboard={dashboard}
        selectedRunId="r1"
        runSummary={baseSummary}
      />,
    );
    expect(screen.queryByText(/suppressed/)).toBeNull();
  });

  it('shows the note even when every violation was suppressed', () => {
    render(
      <RunHeroSection
        dashboard={dashboard}
        selectedRunId="r1"
        runSummary={{
          ...baseSummary,
          totalViolations: 0,
          severity: { critical: 0, major: 0, minor: 0 },
          suppressed: 535,
        }}
      />,
    );
    expect(screen.getByText(/535 suppressed/)).toBeTruthy();
  });

  it('counts deletions, which the dismissed-only number misses', () => {
    // The case that motivated this: a project whose triage history is all
    // deletions reads dismissed: 0 while 391 findings are hidden from the view.
    render(
      <RunHeroSection
        dashboard={dashboard}
        selectedRunId="r1"
        runSummary={{ ...baseSummary, dismissed: 0, suppressed: 391 }}
      />,
    );
    expect(screen.getByText(/391 suppressed/)).toBeTruthy();
  });
});

describe('RunHeroSection primary tiles', () => {
  it('shows SCORE, VIOLATIONS, COMPLIANCE and RATIO with the grade in the hint', () => {
    render(<RunHeroSection dashboard={dashboard} selectedRunId="r1" runSummary={baseSummary} />);
    expect(screen.getAllByText(/^(SCORE|VIOLATIONS|COMPLIANCE|RATIO)$/).map((n) => n.textContent)).toEqual(['SCORE', 'VIOLATIONS', 'COMPLIANCE', 'RATIO']);
    expect(screen.getByText('ADEQUATE').className).toContain('chip');
    expect(screen.getByText('ADEQUATE').closest('.term-stat__hint')).not.toBeNull();
    expect(screen.getByText('ADEQUATE').closest('.term-stat__value-row')).toBeNull();
    expect(screen.queryByText(/^grade /)).toBeNull();
    expect(screen.queryByText('MAJORS')).toBeNull();
  });
});

describe('RunHeroSection formula note', () => {
  const note = /rescored · current formula/;

  it('marks a run scanned with an older formula with one muted line and a tooltip', () => {
    render(<RunHeroSection dashboard={dashboard} selectedRunId="r1" runSummary={baseSummary} formulaUpdated />);
    const el = screen.getByText(note);
    expect(el).toHaveClass('term-stat__suppressed-note');
    expect(el.getAttribute('title')).toMatch(/older grade formula/);
  });

  it('stays silent when the run was scanned with the current formula', () => {
    render(<RunHeroSection dashboard={dashboard} selectedRunId="r1" runSummary={baseSummary} formulaUpdated={false} />);
    expect(screen.queryByText(note)).toBeNull();
  });
});
