// Positions in a history frame's file row (src/quodeq/api/map_history_payload.py).
const ROW_FILE = 0;
const ROW_WEIGHT = 1;
const ROW_VIOLATIONS = 2;
const ROW_COMPLIANCE = 3;
const ROW_CRITICAL = 4;
const ROW_MAJOR = 5;

/** No areas: shared projects, projects without local runs, failed fetches. */
export const NO_AREAS = Object.freeze({ areas: [], files: [], average: 0 });

/**
 * One file's own stats, the shape the Concentration colour reads.
 * @param {number[]} row a history frame file row
 * @returns {{violations:number, compliance:number, weight:number, files:number, critical:number, major:number}}
 */
function rowStats(row) {
  return {
    violations: row[ROW_VIOLATIONS], compliance: row[ROW_COMPLIANCE], weight: row[ROW_WEIGHT],
    files: 1, critical: row[ROW_CRITICAL], major: row[ROW_MAJOR],
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
    const path = payload.fileNames[row[ROW_FILE]];
    const area = byName.get(payload.fileArea[row[ROW_FILE]]);
    if (path === undefined || !area) continue;
    addRow(area, row, path, payload.fileLayer?.[row[ROW_FILE]]);
    files.push({ path, area: area.name });
    weight += row[ROW_WEIGHT];
  }
  const areas = [...byName.values()].filter((a) => a.dots.length).map((a) => ({ ...a, layers: [...a.layers].sort() }));
  return { areas, files, average: weight / Math.max(1, files.length) };
}
