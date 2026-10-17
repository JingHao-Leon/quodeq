import { ROW, FRAME_ENCODING } from './historyRows.js';
import { ACTIVITY_SOURCE } from '../mapVocab.js';

const NO_ROWS = new Map();
const NOT_REPLAYED = -1;

/** No history to play: shared projects, projects without local runs, failed fetches. */
export const NO_TIMELAPSE = Object.freeze({
  activitySource: ACTIVITY_SOURCE.NONE, fileNames: [], fileArea: [], fileLayer: [], runs: [], checks: [], rowsAt: () => NO_ROWS,
});

/** Apply `frame` to `rows` in place: a delta frame updates them, a full frame replaces them. */
function applyFrameInPlace(rows, frame, delta) {
  if (delta) for (const file of frame.gone || []) rows.delete(file);
  else rows.clear();
  for (const row of frame.files || []) rows.set(row[ROW.FILE], row);
}

/** The first frame to replay for run k: a full frame alone, a delta history from the run held when it is earlier, else from the start. */
function replayStart(heldK, k, delta) {
  if (!delta) return k;
  if (heldK >= 0 && heldK < k) return heldK + 1;
  return 0;
}

/**
 * Rows of run k on demand, replayed from the last run asked for when it is
 * earlier (playback walks forward). Each read builds one new Map: rows handed
 * out before are never changed.
 */
function rowsReader(frames, delta) {
  let memo = { k: NOT_REPLAYED, rows: NO_ROWS };
  return (k) => {
    if (k === memo.k) return memo.rows;
    const first = replayStart(memo.k, k, delta);
    const rows = delta && first > 0 ? new Map(memo.rows) : new Map();
    for (let j = first; j <= k; j++) applyFrameInPlace(rows, frames[j], delta);
    memo = { k, rows };
    return rows;
  };
}

function runOf(frame, rows, runId) {
  let issues = 0;
  for (const row of rows.values()) issues += row[ROW.VIOLATIONS];
  return { day: frame.day, runId, added: frame.new || 0, fixed: frame.fixed || 0, issues, areas: frame.areas || [] };
}

/** Each day's last run by day (the run the day is as of), from the payload's `days` and `dayRuns`. */
function dayRunsOf(payload) {
  const days = Array.isArray(payload.days) ? payload.days : [];
  const runs = Array.isArray(payload.dayRuns) ? payload.dayRuns : [];
  return new Map(days.map((day, i) => [day, runs[i] ?? null]));
}

function checksOf(rows, fileCount) {
  const checks = new Float32Array(fileCount);
  for (const [file, row] of rows) checks[file] = Math.max(1, row[ROW.VIOLATIONS] + row[ROW.COMPLIANCE]);
  return checks;
}

/**
 * Every run of a `frames=all` map history payload, oldest first.
 * @param {object|null} payload GET /api/projects/<p>/map/history?frames=all
 * @returns {{activitySource: string, fileNames: string[], fileArea: string[], fileLayer: string[],
 *   runs: {day: string, runId: (string|null), added: number, fixed: number, issues: number, areas: object[]}[],
 *   checks: Float32Array[], rowsAt: function(number): Map<number, number[]>}}
 */
export function decodeTimelapse(payload) {
  const frames = payload?.frames;
  if (!Array.isArray(frames) || !frames.length || !Array.isArray(payload.fileNames)) return NO_TIMELAPSE;
  const delta = payload.frameEncoding === FRAME_ENCODING.DELTA;
  const runs = [];
  const checks = [];
  // One working Map for the whole decode: each frame's runs and checks are read from it before the next frame applies.
  const rows = new Map();
  const runIdOf = dayRunsOf(payload);
  for (const frame of frames) {
    applyFrameInPlace(rows, frame, delta);
    runs.push(runOf(frame, rows, runIdOf.get(frame.day) ?? null));
    checks.push(checksOf(rows, payload.fileNames.length));
  }
  return {
    activitySource: payload.activitySource || ACTIVITY_SOURCE.NONE, fileNames: payload.fileNames,
    fileArea: payload.fileArea || [], fileLayer: payload.fileLayer || [], runs, checks, rowsAt: rowsReader(frames, delta),
  };
}
