import { ACTIVITY_SOURCE } from '../mapVocab.js';

// Positions in a history frame's file row (src/quodeq/api/map_history_payload.py).
const ROW_FILE = 0;
const ROW_EDITS = 6;

/** No activity: shared projects, projects without local runs, failed fetches. */
export const NO_ACTIVITY = Object.freeze({ source: ACTIVITY_SOURCE.NONE, editsByPath: new Map() });

/**
 * Edits per file path from the latest frame of a map history payload.
 * @param {object|null} payload GET /api/projects/<p>/map/history
 * @returns {{source: string, editsByPath: Map<string, number>}}
 */
export function decodeActivity(payload) {
  const frame = payload?.frames?.at(-1);
  if (!frame || !Array.isArray(payload.fileNames) || !Array.isArray(frame.files)) return NO_ACTIVITY;
  const editsByPath = new Map();
  for (const row of frame.files) {
    const path = payload.fileNames[row[ROW_FILE]];
    if (path !== undefined) editsByPath.set(path, row[ROW_EDITS] || 0);
  }
  return { source: payload.activitySource || ACTIVITY_SOURCE.NONE, editsByPath };
}
