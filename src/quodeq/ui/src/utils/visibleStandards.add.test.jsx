import { beforeEach, expect, it, vi } from 'vitest';
import { VISIBLE_STANDARDS_STORAGE_KEY } from '../constants.js';

vi.mock('../api/standards.js', () => ({
  getStandardsVisibility: vi.fn(),
  putStandardsVisibility: vi.fn(),
}));

// Imported AFTER vi.mock so the mocked bindings are the ones under test.
const { putStandardsVisibility } = await import('../api/standards.js');
const { addVisibleStandardId } = await import('./visibleStandards.js');

function fakeStorage(ids) {
  const map = { [VISIBLE_STANDARDS_STORAGE_KEY]: JSON.stringify(ids) };
  return { getItem: (k) => (k in map ? map[k] : null), setItem: (k, v) => { map[k] = v; }, _map: map };
}

const cached = (storage) => JSON.parse(storage._map[VISIBLE_STANDARDS_STORAGE_KEY]);

beforeEach(() => { vi.clearAllMocks(); });

it('appends the standard to the cache and the local project file', async () => {
  const storage = fakeStorage(['security']);
  await addVisibleStandardId('android-bp', { projectId: 'p1', storage });
  expect(cached(storage)).toEqual(['security', 'android-bp']);
  expect(putStandardsVisibility).toHaveBeenCalledWith('p1', ['security', 'android-bp']);
});

it('only moves the cache for a shared project, and skips an id already visible', async () => {
  const storage = fakeStorage(['Android-BP']);
  await addVisibleStandardId('android-bp', { projectId: 'p1', storage });
  await addVisibleStandardId('other', { projectId: null, storage });
  expect(cached(storage)).toEqual(['Android-BP', 'other']);
  expect(putStandardsVisibility).not.toHaveBeenCalled();
});

it('keeps the cache when the server write fails', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  putStandardsVisibility.mockRejectedValueOnce(new Error('offline'));
  const storage = fakeStorage([]);
  await expect(addVisibleStandardId('x', { projectId: 'p1', storage })).resolves.toEqual(['x']);
  expect(cached(storage)).toEqual(['x']);
});
