import { ROW, FRAME_ENCODING } from './historyRows.js';
import { ACTIVITY_SOURCE } from '../mapVocab.js';

const NO_ROWS = new Map();
const NOT_REPLAYED = -1;

/** No history to play: shared projects, projects without local runs, failed fetches. */
export const NO_TIMELAPSE = Object.freeze({
  activitySource: ACTIVITY_SOURCE.NONE, fileNames: [], fileArea: [], fileLayer: [], runs: [], checks: [], rowsAt: () => NO_ROWS,
});

/** The rows after `frame`: a delta frame updates `state`, a full frame replaces it. */
function applyFrame(state, frame, delta) {
  const next = delta ? new Map(state) : new Map();
  if (delta) for (const file of frame.gone || []) next.delete(file);
  for (const row of frame.files || []) next.set(row[ROW.FILE], row);
  return next;
}

/** Rows of run k on demand, replayed from the last run asked for when it is earlier (playback walks forward). */
function rowsReader(frames, delta) {
  let memo = { k: NOT_REPLAYED, rows: NO_ROWS };
  return (k) => {
    if (k === memo.k) return memo.rows;
    const resume = delta && memo.k >= 0 && memo.k < k;
    let rows = resume ? memo.rows : NO_ROWS;
    const first = delta ? (resume ? memo.k + 1 : 0) : k;
    for (let j = first; j <= k; j++) rows = applyFrame(rows, frames[j], delta);
    memo = { k, rows };
    return rows;
  };
}

function runOf(frame, rows) {
  let issues = 0;
  for (const row of rows.values()) issues += row[ROW.VIOLATIONS];
  return { day: frame.day, added: frame.new || 0, fixed: frame.fixed || 0, issues, areas: frame.areas || [] };
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
 *   runs: {day: string, added: number, fixed: number, issues: number, areas: object[]}[],
 *   checks: Float32Array[], rowsAt: function(number): Map<number, number[]>}}
 */
export function decodeTimelapse(payload) {
  const frames = payload?.frames;
  if (!Array.isArray(frames) || !frames.length || !Array.isArray(payload.fileNames)) return NO_TIMELAPSE;
  const delta = payload.frameEncoding === FRAME_ENCODING.DELTA;
  const runs = [];
  const checks = [];
  let rows = NO_ROWS;
  for (const frame of frames) {
    rows = applyFrame(rows, frame, delta);
    runs.push(runOf(frame, rows));
    checks.push(checksOf(rows, payload.fileNames.length));
  }
  return {
    activitySource: payload.activitySource || ACTIVITY_SOURCE.NONE, fileNames: payload.fileNames,
    fileArea: payload.fileArea || [], fileLayer: payload.fileLayer || [], runs, checks, rowsAt: rowsReader(frames, delta),
  };
}
