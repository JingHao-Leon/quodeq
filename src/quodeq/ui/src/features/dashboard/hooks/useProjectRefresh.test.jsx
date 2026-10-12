import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectRefresh } from './useProjectRefresh.js';
import catalog from '../../../strings/en.json' with { type: 'json' };

const refreshProject = vi.fn();
vi.mock('../../../api/projects.js', () => ({ refreshProject: (...args) => refreshProject(...args) }));

function refusal(code, detail) {
  return Object.assign(new Error('server sentence'), { code, body: { detail } });
}

describe('useProjectRefresh', () => {
  it('names a tracked branch that no longer exists on origin', async () => {
    refreshProject.mockRejectedValueOnce(refusal('UPSTREAM_GONE', "fatal: couldn't find remote ref refs/heads/dev"));
    const { result } = renderHook(() => useProjectRefresh('p1'));

    await act(async () => { await result.current.refresh(); });

    expect(result.current.error).toBe(catalog['projects.refreshErrorUpstreamGone']);
    expect(result.current.errorDetail).toBe("fatal: couldn't find remote ref refs/heads/dev");
  });
});
