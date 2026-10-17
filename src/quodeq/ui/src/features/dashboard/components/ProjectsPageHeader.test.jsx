import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProjectsPageHeader } from './ProjectsPageHeader.jsx';

// The Repositories facts line counts what was evaluated, not what exists.
function factsFor(counts) {
  const { unmount } = render(<ProjectsPageHeader counts={{ projectsLoaded: true, teamCount: 0, ...counts }} configured={false} />);
  const text = document.querySelector('.page-toolbar__facts').textContent;
  unmount();
  return text;
}

describe('ProjectsPageHeader facts', () => {
  it('header counts evaluated repositories', () => {
    expect(factsFor({ localCount: 1, evaluatedCount: 0 })).toBe('1 repository · none evaluated yet');
    expect(factsFor({ localCount: 3, evaluatedCount: 0 })).toBe('3 repositories · none evaluated yet');
    expect(factsFor({ localCount: 3, evaluatedCount: 2 })).toBe('2 of 3 evaluated');
    expect(factsFor({ localCount: 3, evaluatedCount: 3 })).toBe('3 repositories evaluated');
    expect(factsFor({ localCount: 1, evaluatedCount: 1 })).toBe('1 repository evaluated');
  });

  it('says loading before the list lands', () => {
    render(<ProjectsPageHeader counts={{ projectsLoaded: false, localCount: 0, evaluatedCount: 0, teamCount: 0 }} configured={false} />);
    expect(screen.queryByText(/evaluated/)).not.toBeInTheDocument();
  });
});
