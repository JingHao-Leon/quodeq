import { beforeEach, expect, it, vi } from 'vitest';
import {
  VISIBLE_STANDARDS_STORAGE_KEY, STANDARDS_CHANGED_EVENT, STANDARDS_CHANGED_REASON,
} from '../constants.js';

vi.mock('../api/standards.js', () => ({
  getStandardsVisibility: vi.fn(),
  putStandardsVisibility: vi.fn(),
}));

// Imported AFTER vi.mock so the mocked bindings are the ones under test.
const { getStandardsVisibility, putStandardsVisibility } = await import('../api/standards.js');
const { hydrateVisibleStandardIds, getVisibilityState, readVisibleStandardIds, writeVisibleStandardIds } =
  await import('./visibleStandards.js');

function fakeStorage(initial = {}) {
  const map = { ...initial };
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = v; },
    _map: map,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('hydrate adopts the server ids and never PUTs, even when the cache differs', async () => {
  const storage = fakeStorage({ [VISIBLE_STANDARDS_STORAGE_KEY]: JSON.stringify(['usability']) });
  getStandardsVisibility.mockResolvedValue({
    visibleStandardIds: ['security'], isDefault: true, defaultStandardIds: ['security'],
  });
  const ids = await hydrateVisibleStandardIds('p1', { storage });
  expect(ids).toEqual(['security']);
  expect(putStandardsVisibility).not.toHaveBeenCalled();
});

it('getVisibilityState also reports where the settings were migrated from', async () => {
  getStandardsVisibility.mockResolvedValue({ visibleStandardIds: ['security'], migratedFrom: '/repo/a' });
  expect(await getVisibilityState('p1', { storage: fakeStorage() })).toEqual({ ids: ['security'], migratedFrom: '/repo/a' });
});

it('visibilityProjectIdFor no longer exists: every project writes through the API', async () => {
  const mod = await import('./visibleStandards.js');
  expect(mod.visibilityProjectIdFor).toBeUndefined();
});


it('writeVisibleStandardIds broadcasts a visibility change for same-tab listeners', () => {
  const seen = [];
  const listener = (evt) => seen.push(evt.detail?.reason);
  window.addEventListener(STANDARDS_CHANGED_EVENT, listener);
  try {
    writeVisibleStandardIds(['security'], fakeStorage());
    expect(seen).toEqual([STANDARDS_CHANGED_REASON.VISIBILITY]);
  } finally {
    window.removeEventListener(STANDARDS_CHANGED_EVENT, listener);
  }
});

it('caches the server selection into storage', async () => {
  getStandardsVisibility.mockResolvedValue({
    visibleStandardIds: ['security'], isDefault: false,
  });
  const storage = fakeStorage();
  const ids = await hydrateVisibleStandardIds('p1', { storage });
  expect(ids).toEqual(['security']);
  expect(JSON.parse(storage._map[VISIBLE_STANDARDS_STORAGE_KEY])).toEqual(['security']);
});

it('leaves the cached value in place when the request fails', async () => {
  getStandardsVisibility.mockRejectedValue(new Error('offline'));
  const storage = fakeStorage({
    [VISIBLE_STANDARDS_STORAGE_KEY]: JSON.stringify(['security']),
  });
  const ids = await hydrateVisibleStandardIds('p1', { storage });
  expect(ids).toEqual(['security']);
  expect(readVisibleStandardIds(storage)).toEqual(['security']);
});

it('does not write a stale project response over the current project\'s cache (race)', async () => {
  // Mirrors the App.jsx effect: each in-flight hydrate is given an isStale()
  // predicate that flips true once the selected project moves on. Project A
  // is still in flight when the user switches to B; B resolves first and
  // caches its own selection; A resolves last and must be ignored.
  let currentProject = 'A';
  const isStaleFor = (projectId) => () => currentProject !== projectId;

  let resolveA;
  const aPromise = new Promise((resolve) => { resolveA = resolve; });
  getStandardsVisibility.mockImplementation((projectId) => (
    projectId === 'A' ? aPromise : Promise.resolve({ visibleStandardIds: ['reliability'], isDefault: false })
  ));

  const storage = fakeStorage();
  const hydrateA = hydrateVisibleStandardIds('A', { storage, isStale: isStaleFor('A') });

  currentProject = 'B';
  await hydrateVisibleStandardIds('B', { storage, isStale: isStaleFor('B') });
  expect(JSON.parse(storage._map[VISIBLE_STANDARDS_STORAGE_KEY])).toEqual(['reliability']);

  resolveA({ visibleStandardIds: ['security'], isDefault: false });
  await hydrateA;

  expect(JSON.parse(storage._map[VISIBLE_STANDARDS_STORAGE_KEY])).toEqual(['reliability']);
});

it('does not let a hydrate GET overwrite a same-project toggle that persisted while it was in flight (race)', async () => {
  // Reproduces the reviewer's sequence:
  //   1. hydrate(P) fires its GET; it's slow.
  //   2. Before it resolves, the user toggles a standard on the Standards
  //      page. persist() synchronously writes the new list to the cache and
  //      PUTs it — the server is now updated too.
  //   3. The earlier GET resolves carrying PRE-TOGGLE server state.
  // isStale() alone can't catch this: the project never changed, only P's
  // own value did. The cache must end up holding the TOGGLED value, not the
  // stale GET response.
  let resolveGet;
  const getPromise = new Promise((resolve) => { resolveGet = resolve; });
  getStandardsVisibility.mockImplementation(() => getPromise);

  const storage = fakeStorage({
    [VISIBLE_STANDARDS_STORAGE_KEY]: JSON.stringify(['security']),
  });

  // isStale never trips here: same project throughout, mirroring the report.
  const hydrate = hydrateVisibleStandardIds('p1', { storage, isStale: () => false });

  // Simulates useVisibleStandards' persist(): synchronous cache write, then
  // a PUT (fire-and-forget from the caller's perspective, already resolved
  // here since it's mocked).
  writeVisibleStandardIds(['security', 'reliability'], storage);
  await putStandardsVisibility('p1', ['security', 'reliability']);

  // The slow GET now resolves with the state the server had BEFORE the
  // toggle above.
  resolveGet({ visibleStandardIds: ['security'], isDefault: false });
  await hydrate;

  expect(JSON.parse(storage._map[VISIBLE_STANDARDS_STORAGE_KEY])).toEqual(['security', 'reliability']);
});

it('two injected storages keep separate write generations -- a write to one never supersedes an in-flight hydrate for the other', async () => {
  // The write generation used to be one module-global counter shared by every
  // caller. A write to storage A would bump it and wrongly make an unrelated,
  // still in-flight hydrate for storage B look "superseded", discarding B's
  // legitimate GET response even though nothing about B changed. Production
  // has one localStorage, so this never showed up there -- it only bites when
  // tests (or anything else) inject more than one storage.
  const storageA = fakeStorage();
  const storageB = fakeStorage();

  let resolveGetB;
  const getBPromise = new Promise((resolve) => { resolveGetB = resolve; });
  getStandardsVisibility.mockImplementation((projectId) => (
    projectId === 'B' ? getBPromise : Promise.resolve({ visibleStandardIds: ['x'], isDefault: false })
  ));

  // Start B's hydrate; it's slow (GET still pending).
  const hydrateB = hydrateVisibleStandardIds('B', { storage: storageB, isStale: () => false });

  // An unrelated write lands on storage A while B is still in flight.
  writeVisibleStandardIds(['unrelated'], storageA);

  // B's GET now resolves.
  resolveGetB({ visibleStandardIds: ['reliability'], isDefault: false });
  const idsForB = await hydrateB;

  expect(idsForB).toEqual(['reliability']);
  expect(JSON.parse(storageB._map[VISIBLE_STANDARDS_STORAGE_KEY])).toEqual(['reliability']);
});
