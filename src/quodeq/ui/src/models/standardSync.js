/**
 * How a standard compares with the shared repository, as the Standards page shows it:
 * the sync cell and the actions a row offers. Pure, no React (node-tested).
 */
import { STANDARD_TYPES } from './standard.js';

export const SYNC_STATE = Object.freeze({
  NEVER_SHARED: 'never_shared', PUBLISHED: 'published', CHANGED: 'changed',
  UPDATE_AVAILABLE: 'update_available', DIVERGED: 'diverged',
  REMOTE_ONLY: 'remote_only', REMOVED_REMOTELY: 'removed_remotely',
});

export const SYNC_ACTION = Object.freeze({ SHARE: 'share', PUBLISH: 'publish', UPDATE: 'update', INSTALL: 'install' });

const BUILTIN_TYPES = new Set([STANDARD_TYPES.ISO, STANDARD_TYPES.WCAG, STANDARD_TYPES.QUODEQ]);
const OK = 'ok';
const WARN = 'warn';
const MUTED = 'muted';

export function isBuiltinType(type) {
  return BUILTIN_TYPES.has(type);
}

// A missing publish time must not print as "null": fall back to the copy that names none.
function timed(tone, s, key, keyNoTime) {
  return s.publishedAt ? { tone, key, time: s.publishedAt } : { tone, key: keyNoTime, time: null };
}

const CELLS = {
  [SYNC_STATE.PUBLISHED]: (s) => timed(OK, s, 'standards.syncPublished', 'standards.syncPublishedNoTime'),
  [SYNC_STATE.CHANGED]: (s) => timed(WARN, s, 'standards.syncChanged', 'standards.syncChangedNoTime'),
  [SYNC_STATE.UPDATE_AVAILABLE]: () => ({ tone: WARN, key: 'standards.syncUpdateAvailable', time: null }),
  [SYNC_STATE.DIVERGED]: () => ({ tone: WARN, key: 'standards.syncDiverged', time: null }),
  [SYNC_STATE.REMOTE_ONLY]: () => ({ tone: MUTED, key: 'standards.syncRemote', time: null }),
  [SYNC_STATE.NEVER_SHARED]: () => ({ tone: MUTED, key: null, time: null }),
  [SYNC_STATE.REMOVED_REMOTELY]: () => ({ tone: MUTED, key: null, time: null }),
};

/** The sync cell for *standard*; null when no shared repository is connected. */
export function syncCell(standard) {
  if (isBuiltinType(standard?.type)) return { tone: MUTED, key: 'standards.syncBuiltin', time: null };
  const build = CELLS[standard?.syncState];
  return build ? build(standard) : null;
}

const ACTIONS = {
  [SYNC_STATE.NEVER_SHARED]: [{ action: SYNC_ACTION.SHARE, force: false }],
  [SYNC_STATE.REMOVED_REMOTELY]: [{ action: SYNC_ACTION.SHARE, force: false }],
  [SYNC_STATE.CHANGED]: [{ action: SYNC_ACTION.PUBLISH, force: false }],
  [SYNC_STATE.UPDATE_AVAILABLE]: [{ action: SYNC_ACTION.UPDATE, force: false }],
  [SYNC_STATE.DIVERGED]: [{ action: SYNC_ACTION.PUBLISH, force: true }, { action: SYNC_ACTION.UPDATE, force: true }],
  [SYNC_STATE.REMOTE_ONLY]: [{ action: SYNC_ACTION.INSTALL, force: false }],
};

/** The sync actions a row offers, in display order. */
export function syncActions(standard) {
  if (isBuiltinType(standard?.type)) return [];
  return ACTIONS[standard?.syncState] ?? [];
}
