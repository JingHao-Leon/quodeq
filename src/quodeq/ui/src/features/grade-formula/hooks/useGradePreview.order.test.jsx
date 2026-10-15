import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../../api/index.js', () => ({ previewGradeFormula: vi.fn() }));

import { previewGradeFormula } from '../../../api/index.js';
import { useGradePreview } from './useGradePreview.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const side = (score) => ({ overall: { score, grade: 'Good' }, dimensions: [] });
const payload = (id, score) => ({ projects: [{ id, before: side(7), after: side(score) }], runsToRescore: 1 });

function mount(projectId) {
  const showPreview = vi.fn();
  const debounceRef = { current: null };
  const hook = renderHook(
    ({ id }) => useGradePreview({
      projectId: id, draft: { baseK: 1 }, updateDraft: (fn) => fn({ baseK: 1 }),
      showPreview, debounceRef, loaded: false,
    }),
    { initialProps: { id: projectId } },
  );
  return { hook, showPreview };
}

async function settle(hook, patch) {
  act(() => { hook.result.current.update(patch); });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

const shownScores = (showPreview) => showPreview.mock.calls
  .map(([value]) => (value ? value.after.overall.score : null));

beforeEach(() => {
  vi.useFakeTimers();
  previewGradeFormula.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useGradePreview response order', () => {
  it('keeps the newest draft when an older response lands last', async () => {
    const older = deferred();
    const newer = deferred();
    previewGradeFormula.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const { hook, showPreview } = mount('a');

    await settle(hook, { baseK: 2 });
    await settle(hook, { baseK: 3 });
    await act(async () => { newer.resolve(payload('a', 6)); });
    await act(async () => { older.resolve(payload('a', 9)); });

    expect(shownScores(showPreview)).not.toContain(9);
    expect(shownScores(showPreview).at(-1)).toBe(6);
  });

  it('clears the strip and drops the in-flight answer when the project changes', async () => {
    const inFlight = deferred();
    previewGradeFormula.mockReturnValueOnce(inFlight.promise);
    const { hook, showPreview } = mount('a');

    await settle(hook, { baseK: 2 });
    hook.rerender({ id: 'b' });
    await act(async () => { inFlight.resolve(payload('a', 9)); });

    expect(shownScores(showPreview)).not.toContain(9);
    expect(shownScores(showPreview).at(-1)).toBeNull();
  });
});
