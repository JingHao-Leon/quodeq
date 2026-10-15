import {
  VISIBLE_STANDARDS_STORAGE_KEY, DEFAULT_VISIBLE_STANDARDS,
  STANDARDS_CHANGED_REASON, notifyStandardsChanged,
} from '../constants.js';
import { getStandardsVisibility, putStandardsVisibility } from '../api/standards.js';

/**
 * Read the visible standard IDs from localStorage.
 * Returns the default ISO dimensions if nothing is stored.
 */
export function readVisibleStandardIds(storage = localStorage) {
  try {
    const raw = storage.getItem(VISIBLE_STANDARDS_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_STANDARDS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_VISIBLE_STANDARDS;
  } catch (err) {
    console.warn('[visibleStandards] could not read visible standard ids:', err);
    return DEFAULT_VISIBLE_STANDARDS;
  }
}

// Monotonic counter bumped by every cache write (this module's own write and
// hydrate's two write sites). hydrateVisibleStandardIds samples it right
// before issuing its GET; if the counter has moved by the time a write would
// happen, some other write (a toggle's persist(), or another hydrate call)
// already landed a newer value, and this response is discarded instead of
// clobbering it.
//
// Keyed per Storage (WeakMap<Storage, number>) rather than one module-global
// number: production has exactly one localStorage, so this is identical
// there, but a write to one injected test storage must never supersede an
// in-flight hydrate for a different storage. Every caller awaits its
// in-flight hydrate before the next one starts. A promise left dangling
// across a test boundary would otherwise trip a later call's check, so
// `resetWriteGeneration` below exists as the structural escape hatch that
// note used to only ask for.
let writeGenerations = new WeakMap();

function generationFor(storage) {
  return writeGenerations.get(storage) || 0;
}

/** Reset every storage's write generation. Test-isolation hook; returns the new value. */
export function resetWriteGeneration() {
  writeGenerations = new WeakMap();
  return 0;
}

/** Write the selection to the local cache. The server is the source of truth. */
export function writeVisibleStandardIds(ids, storage = localStorage) {
  storage.setItem(VISIBLE_STANDARDS_STORAGE_KEY, JSON.stringify(ids));
  writeGenerations.set(storage, generationFor(storage) + 1);
  // Same-tab consumers (the Evaluate picker) read this cache synchronously
  // and only on mount; tell them it moved.
  notifyStandardsChanged(STANDARDS_CHANGED_REASON.VISIBILITY);
}

/**
 * Make one standard visible from outside the Standards page (an assistant
 * create applied on another screen): append it to the local cache and, for
 * that project's visibility file. Membership is
 * case-insensitive like useVisibleStandards. A failed PUT only warns: the
 * cache is already right for this session and the next hydrate re-syncs.
 */
export async function addVisibleStandardId(id, { projectId = null, storage = localStorage } = {}) {
  const ids = readVisibleStandardIds(storage);
  if (ids.some((x) => x.toLowerCase() === id.toLowerCase())) return ids;
  const next = [...ids, id];
  writeVisibleStandardIds(next, storage);
  if (projectId) {
    try {
      await putStandardsVisibility(projectId, next);
    } catch (err) {
      console.warn('[visibleStandards] server sync failed:', err);
    }
  }
  return next;
}

/**
 * Sync the local cache with the server for a project, and report where the
 * server migrated the project's legacy repo settings from (null if nowhere).
 *
 * The settings file under ~/.quodeq is authoritative; localStorage is only
 * the synchronous read cache for the sites that cannot await. The server
 * migrates any legacy repo file itself, so the browser never pushes its
 * cache up.
 *
 * Never throws: an offline/failed fetch leaves the cached value in place.
 *
 * Two independent guards run right before the write:
 *
 * - `isStale` guards against the PROJECT changing: if the caller fires this
 *   for project A and the user switches to project B before the request
 *   resolves, A's response must not land in the (per-browser, not
 *   per-project) cache over B's.
 * - The generation counter guards against a newer WRITE for the SAME
 *   project already having landed: e.g. this GET was in flight when the
 *   user toggled a standard, and persist() synchronously wrote and PUT the
 *   toggle before this GET resolved with pre-toggle server state.
 */
export async function getVisibilityState(projectId, { storage = localStorage, isStale } = {}) {
  if (!projectId) return { ids: readVisibleStandardIds(storage), migratedFrom: null };
  const generationAtStart = generationFor(storage);
  const supersededByNewerWrite = () => isStale?.() || generationFor(storage) !== generationAtStart;
  try {
    const { visibleStandardIds, migratedFrom = null } = await getStandardsVisibility(projectId);
    if (supersededByNewerWrite()) return { ids: readVisibleStandardIds(storage), migratedFrom: null };
    writeVisibleStandardIds(visibleStandardIds, storage);
    return { ids: visibleStandardIds, migratedFrom };
  } catch (err) {
    // Covers both an offline/failed fetch (expected, cache stays put) and a
    // genuine bug such as a response-shape change throwing a TypeError. The
    // two aren't cheaply distinguishable here, so we warn for both rather
    // than let a real regression degrade invisibly to "serve stale cache".
    console.warn('getVisibilityState: falling back to cached value', err);
    return { ids: readVisibleStandardIds(storage), migratedFrom: null };
  }
}

/** The visible standard ids for a project (see getVisibilityState). */
export async function hydrateVisibleStandardIds(projectId, options) {
  return (await getVisibilityState(projectId, options)).ids;
}
