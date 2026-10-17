import { describe, it, expect, vi } from 'vitest';
import { reselectAfterDeleteAll } from './routeCases.jsx';

// Settings' delete all removes every local project's evaluations: a local
// selection would point at a project that no longer exists.
describe('reselectAfterDeleteAll', () => {
  it('clears a local selection to the no-project state', () => {
    const handleProjectChange = vi.fn();
    reselectAfterDeleteAll({ selectedProject: 'p1', selectedSource: 'local', handleProjectChange });
    expect(handleProjectChange).toHaveBeenCalledWith('', 'local');
  });

  it('leaves a shared selection alone, its data is not on this machine', () => {
    const handleProjectChange = vi.fn();
    reselectAfterDeleteAll({ selectedProject: 'p1', selectedSource: 'shared', handleProjectChange });
    expect(handleProjectChange).not.toHaveBeenCalled();
  });

  it('does nothing with no project selected', () => {
    const handleProjectChange = vi.fn();
    reselectAfterDeleteAll({ selectedProject: '', selectedSource: 'local', handleProjectChange });
    expect(handleProjectChange).not.toHaveBeenCalled();
  });
});
