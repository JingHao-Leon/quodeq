import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NameCell } from './RowCells.jsx';
import catalog from '../../../../strings/en.json' with { type: 'json' };

function renderName(project) {
  const entry = { local: project, shared: null };
  return render(<NameCell entry={entry} project={project} onOpen={() => {}} />);
}

describe('NameCell branch', () => {
  it('shows the checked-out branch after the folder', () => {
    const { container } = renderName({ id: 'p', name: 'growstuff', path: '/tmp/growstuff', branch: 'dev', pathExists: true });

    const branch = container.querySelector('.projects-row__branch');
    expect(branch.textContent).toBe('dev');
    expect(branch.getAttribute('title')).toBe(catalog['projects.branchTitle']);
  });

  it('shows no branch for a folder that is not a git checkout', () => {
    const { container } = renderName({ id: 'p', name: 'plain', path: '/tmp/plain', branch: null, pathExists: true });

    expect(container.querySelector('.projects-row__branch')).toBeNull();
  });
});
