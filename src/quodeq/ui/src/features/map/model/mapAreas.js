import { ROW } from './historyRows.js';

/** No areas: shared projects, projects without local runs, failed fetches. */
export const NO_AREAS = Object.freeze({ areas: [], files: [], average: 0 });

/**
 * One file's own stats, the shape the Concentration colour reads.
 * @param {number[]} row a history frame file row
 * @returns {{violations:number, compliance:number, weight:number, files:number, critical:number, major:number}}
 */
function rowStats(row) {
  return {
    violations: row[ROW.VIOLATIONS], compliance: row[ROW.COMPLIANCE], weight: row[ROW.WEIGHT],
    files: 1, critical: row[ROW.CRITICAL], major: row[ROW.MAJOR],
  };
}

function newArea(entry) {
  return {
    name: entry.area,
    kind: entry.kind,
    density: entry.density || 0,
    touchedShare: entry.touchedShare || 0,
    layers: new Set(),
    dots: [],
    stats: { violations: 0, compliance: 0, weight: 0, files: 0, critical: 0, major: 0 },
  };
}

function addRow(area, row, path, layer) {
  const own = rowStats(row);
  for (const key of Object.keys(own)) area.stats[key] += own[key];
  if (layer) area.layers.add(layer);
  area.dots.push({ path, stats: own, checks: Math.max(1, own.violations + own.compliance) });
}

function isDecodable(payload, frame) {
  return Boolean(frame) && Array.isArray(payload.fileNames) && Array.isArray(payload.fileArea)
    && Array.isArray(frame.files) && Array.isArray(frame.areas);
}

/**
 * One run's areas with their files, for the Risk sky.
 * @param {{fileNames: string[], fileArea: string[], fileLayer?: string[]}} names the history's per-file names
 * @param {object[]} frameAreas the run's area metrics
 * @param {Iterable<number[]>} rows the run's file rows
 * @returns {{areas: object[], files: {path: string, area: string}[], average: number}}
 */
export function buildAreaSet(names, frameAreas, rows) {
  const byName = new Map(frameAreas.map((entry) => [entry.area, newArea(entry)]));
  const files = [];
  let weight = 0;
  for (const row of rows) {
    const path = names.fileNames[row[ROW.FILE]];
    const area = byName.get(names.fileArea[row[ROW.FILE]]);
    if (path === undefined || !area) continue;
    addRow(area, row, path, names.fileLayer?.[row[ROW.FILE]]);
    files.push({ path, area: area.name });
    weight += row[ROW.WEIGHT];
  }
  const areas = [...byName.values()].filter((a) => a.dots.length).map((a) => ({ ...a, layers: [...a.layers].sort() }));
  return { areas, files, average: weight / Math.max(1, files.length) };
}

/**
 * The latest frame's areas with their files, for the Risk sky.
 * @param {object|null} payload GET /api/projects/<p>/map/history
 * @returns {{areas: object[], files: {path: string, area: string}[], average: number}}
 */
export function decodeAreas(payload) {
  const frame = payload?.frames?.at(-1);
  if (!isDecodable(payload || {}, frame)) return NO_AREAS;
  return buildAreaSet(payload, frame.areas, frame.files);
}

/**
 * Run `k`'s areas of a decoded history (decodeTimelapse), NO_AREAS past its end.
 * @param {{runs: {areas: object[]}[], rowsAt: function(number): Map<number, number[]>}} data decodeTimelapse(...)
 * @param {number} k run index
 * @returns {{areas: object[], files: {path: string, area: string}[], average: number}}
 */
export function areaSetAt(data, k) {
  const run = data.runs[k];
  return run ? buildAreaSet(data, run.areas, data.rowsAt(k).values()) : NO_AREAS;
}
