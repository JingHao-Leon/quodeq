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

/**
 * A history of `runs` runs over `files` files: files are born over the first
 * runs, a `churn` share leaves later, and check counts wobble a little.
 * @returns {{parent: Int32Array, fileOf: Int32Array, sizes: Float32Array[], maxSize: Float32Array}}
 */
export function syntheticModel({ files, runs, seed = 1, churn = SMALL_CHURN }) {
  const rand = seededRandom(seed);
  const { parent, fileOf } = bfsTree(syntheticPaths(files, rand));
  const born = Array.from({ length: files }, () => Math.floor(rand() * runs * BORN_SPREAD));
  const gone = born.map((b) => (rand() < churn ? b + 1 + Math.floor(rand() * runs) : runs));
  const base = Array.from({ length: files }, () => 1 + Math.floor(rand() * MAX_CHECKS));
  const present = (f, k) => f !== NO_FILE && born[f] <= k && k < gone[f];
  const sizes = Array.from({ length: runs }, (_, k) => Float32Array.from(fileOf, (f) => (present(f, k) ? base[f] + ((k + f) % SIZE_WOBBLE) : 0)));
  const maxSize = Float32Array.from(fileOf, (f, i) => (f === NO_FILE ? 0 : Math.max(1, ...sizes.map((s) => s[i]))));
  return { parent, fileOf, sizes, maxSize };
}
