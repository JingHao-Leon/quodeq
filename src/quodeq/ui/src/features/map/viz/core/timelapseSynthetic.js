// Seeded synthetic histories for the time-lapse layout tests, budgets and measurements.

const UINT32 = 4294967296;
const MULBERRY_STEP = 0x6d2b79f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const MIX_B = 61;
const TOP_FOLDERS = 8;
const SUB_FOLDERS = 6;
const DEEP_SHARE = 0.4;
const MAX_CHECKS = 40;
const BORN_SPREAD = 0.6;   // files are born over the first 60 % of runs
const SIZE_WOBBLE = 3;     // a file's checks vary a little run to run
/** Share of files that leave at some run. */
export const SMALL_CHURN = 0.05;
const NO_FILE = -1;
const START_DAY = Date.parse('2026-01-01T12:00:00Z');
const DAY_MS = 86400000;
const ISO_DAY_LENGTH = 10;
const VIOLATION_SHARE = 3;   // a synthetic file's violations: a third of its checks

/** A small, fast, seeded generator in [0, 1) (mulberry32). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + MULBERRY_STEP) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> SHIFT_A), t | 1);
    t ^= t + Math.imul(t ^ (t >>> SHIFT_B), t | MIX_B);
    return ((t ^ (t >>> SHIFT_C)) >>> 0) / UINT32;
  };
}

/** `files` paths spread over two or three folder levels. */
export function syntheticPaths(files, rand) {
  const pick = (n) => Math.floor(rand() * n);
  return Array.from({ length: files }, (_, i) => {
    const deep = rand() < DEEP_SHARE ? `/d${pick(SUB_FOLDERS)}` : '';
    return `p${pick(TOP_FOLDERS)}/m${pick(SUB_FOLDERS)}${deep}/f${i}.py`;
  });
}

/** Breadth-first parent array and file index per node of the folder tree over `paths`. */
export function bfsTree(paths) {
  const root = { kids: new Map(), file: NO_FILE };
  paths.forEach((path, f) => {
    let node = root;
    for (const seg of path.split('/')) {
      if (!node.kids.has(seg)) node.kids.set(seg, { kids: new Map(), file: NO_FILE });
      node = node.kids.get(seg);
    }
    node.file = f;
  });
  const parent = [NO_FILE];
  const fileOf = [NO_FILE];
  const queue = [[root, 0]];
  for (let q = 0; q < queue.length; q++) {
    const [node, i] = queue[q];
    for (const kid of node.kids.values()) {
      queue.push([kid, parent.length]);
      parent.push(i);
      fileOf.push(kid.file);
    }
  }
  return { parent: Int32Array.from(parent), fileOf: Int32Array.from(fileOf) };
}

/** Per file and run: its checks, 0 when absent (files born early, a `churn` share leaving later). */
function fileHistory({ files, runs, churn }, rand) {
  const born = Array.from({ length: files }, () => Math.floor(rand() * runs * BORN_SPREAD));
  const gone = born.map((b) => (rand() < churn ? b + 1 + Math.floor(rand() * runs) : runs));
  const base = Array.from({ length: files }, () => 1 + Math.floor(rand() * MAX_CHECKS));
  return (f, k) => (born[f] <= k && k < gone[f] ? base[f] + ((k + f) % SIZE_WOBBLE) : 0);
}

/** Per node, its largest size over the runs (at least 1 for a file, 0 for a folder), in one pass over the runs. */
function largestSizes(sizes, fileOf) {
  const max = Float32Array.from(fileOf, (f) => (f === NO_FILE ? 0 : 1));
  for (const run of sizes) for (let i = 0; i < run.length; i++) if (run[i] > max[i]) max[i] = run[i];
  return max;
}

/**
 * A history of `runs` runs over `files` files: files are born over the first
 * runs, a `churn` share leaves later, and check counts wobble a little.
 * @returns {{parent: Int32Array, fileOf: Int32Array, sizes: Float32Array[], maxSize: Float32Array}}
 */
export function syntheticModel({ files, runs, seed = 1, churn = SMALL_CHURN }) {
  const rand = seededRandom(seed);
  const { parent, fileOf } = bfsTree(syntheticPaths(files, rand));
  const checkAt = fileHistory({ files, runs, churn }, rand);
  const sizes = Array.from({ length: runs }, (_, k) => Float32Array.from(fileOf, (f) => (f === NO_FILE ? 0 : checkAt(f, k))));
  return { parent, fileOf, sizes, maxSize: largestSizes(sizes, fileOf) };
}

function syntheticRow(f, checks, k) {
  const violations = Math.floor(checks / VIOLATION_SHARE);
  return [f, violations, violations, checks - violations, 0, Math.floor(violations / 2), k, -1];
}

/** A `frames=all` delta payload over a synthetic history (same shape as GET /map/history?frames=all). */
export function syntheticPayload({ files, runs, seed = 1, churn = SMALL_CHURN }) {
  const rand = seededRandom(seed);
  const paths = syntheticPaths(files, rand);
  const checkAt = fileHistory({ files, runs, churn }, rand);
  const frames = [];
  let before = new Map();
  for (let k = 0; k < runs; k++) {
    const rows = new Map();
    for (let f = 0; f < files; f++) if (checkAt(f, k)) rows.set(f, syntheticRow(f, checkAt(f, k), k));
    frames.push({
      day: new Date(START_DAY + k * DAY_MS).toISOString().slice(0, ISO_DAY_LENGTH), new: 0, fixed: 0, areas: [],
      files: [...rows].filter(([f, r]) => String(before.get(f)) !== String(r)).map(([, r]) => r),
      gone: [...before.keys()].filter((f) => !rows.has(f)),
    });
    before = rows;
  }
  return { activitySource: 'estimated', fileNames: paths, fileArea: paths.map(() => 'x'), fileLayer: paths.map(() => ''), frameEncoding: 'delta', frames };
}
