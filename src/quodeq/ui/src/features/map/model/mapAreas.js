import { SEVERITY } from '../../../vocab/severity.js';
import { ROW } from './historyRows.js';

/** No areas: shared projects, projects without local runs, failed fetches. */
export const NO_AREAS = Object.freeze({ areas: [], files: [], average: 0 });

/**
 * The worst violation of a file row, or null when it has none.
 * @param {number[]} row a history frame file row
 * @returns {string|null} a SEVERITY value
 */
export function rowWorstSeverity(row) {
  if (row[ROW.CRITICAL] > 0) return SEVERITY.CRITICAL;
  if (row[ROW.MAJOR] > 0) return SEVERITY.MAJOR;
  return row[ROW.VIOLATIONS] > 0 ? SEVERITY.MINOR : null;
}

function newArea(entry) {
  return {
    name: entry.area,
    kind: entry.kind,
    needPct: entry.needPct || 0,
    touchedShare: entry.touchedShare || 0,
    layers: new Set(),
    dots: [],
    stats: { violations: 0, compliance: 0, weight: 0, files: 0, critical: 0, major: 0 },
  };
}

function addRow(area, row, path, layer) {
  const s = area.stats;
  s.violations += row[ROW.VIOLATIONS];
  s.compliance += row[ROW.COMPLIANCE];
  s.weight += row[ROW.WEIGHT];
  s.files += 1;
  s.critical += row[ROW.CRITICAL];
  s.major += row[ROW.MAJOR];
  if (layer) area.layers.add(layer);
  area.dots.push({ path, worst: rowWorstSeverity(row), checks: Math.max(1, row[ROW.VIOLATIONS] + row[ROW.COMPLIANCE]) });
}

function isDecodable(payload, frame) {
  return Boolean(frame) && Array.isArray(payload.fileNames) && Array.isArray(payload.fileArea)
    && Array.isArray(frame.files) && Array.isArray(frame.areas);
}

/**
 * The latest frame's areas with their files, for the Risk sky.
 * @param {object|null} payload GET /api/projects/<p>/map/history
 * @returns {{areas: object[], files: {path: string, area: string}[], average: number}}
 */
export function decodeAreas(payload) {
  const frame = payload?.frames?.at(-1);
  if (!isDecodable(payload || {}, frame)) return NO_AREAS;
  const byName = new Map(frame.areas.map((entry) => [entry.area, newArea(entry)]));
  const files = [];
  let weight = 0;
  for (const row of frame.files) {
    const path = payload.fileNames[row[ROW.FILE]];
    const area = byName.get(payload.fileArea[row[ROW.FILE]]);
    if (path === undefined || !area) continue;
    addRow(area, row, path, payload.fileLayer?.[row[ROW.FILE]]);
    files.push({ path, area: area.name });
    weight += row[ROW.WEIGHT];
  }
  const areas = [...byName.values()].filter((a) => a.dots.length).map((a) => ({ ...a, layers: [...a.layers].sort() }));
  return { areas, files, average: weight / Math.max(1, files.length) };
}
