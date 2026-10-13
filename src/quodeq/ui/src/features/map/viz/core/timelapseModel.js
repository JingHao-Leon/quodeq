import { hierarchy } from 'd3-hierarchy';
import { buildPathTree } from './fileTree.js';
import { filePathKey } from '../../model/mapActivity.js';

const NO_FILE = -1;
let modelCount = 0;

function maxChecksPerFile(data) {
  const max = new Float32Array(data.fileNames.length);
  for (const sizes of data.checks) for (let f = 0; f < sizes.length; f++) if (sizes[f] > max[f]) max[f] = sizes[f];
  return max;
}

/** Largest whole-history size first, equal sizes by name, so a build is deterministic. */
function largestFirst(a, b) {
  if (b.value !== a.value) return b.value - a.value;
  if (a.data.name === b.data.name) return 0;
  return a.data.name < b.data.name ? -1 : 1;
}

/**
 * The whole-history tree of a decoded history: every file ever seen, folders
 * collapsed like the Map's tree, nodes breadth-first with siblings largest
 * first (by their whole-history size, like the Pack view, so the anchor packs
 * as densely), and the per-node arrays the time-lapse layout reads. Two
 * spellings of one path (`./a` and `a`) are one file.
 * @param {{fileNames: string[], checks: Float32Array[]}} data decodeTimelapse(...)
 */
export function buildTimelapseModel(data) {
  const keys = data.fileNames.map(filePathKey);
  const fileIndex = new Map(keys.map((key, i) => [key, i]));
  const maxChecks = maxChecksPerFile(data);
  const root = hierarchy(buildPathTree(keys))
    .sum((d) => (d.children.length ? 0 : Math.max(1, maxChecks[fileIndex.get(d.path)] || 0)))
    .sort(largestFirst);
  const nodes = root.descendants();
  const index = new Map(nodes.map((n, i) => [n, i]));
  const fileOf = Int32Array.from(nodes, (n) => (n.children ? NO_FILE : fileIndex.get(n.data.path) ?? NO_FILE));
  modelCount += 1;
  return {
    id: modelCount, root, nodes, index, fileOf,
    parent: Int32Array.from(nodes, (n) => (n.parent ? index.get(n.parent) : NO_FILE)),
    sizes: data.checks.map((c) => Float32Array.from(fileOf, (f) => (f === NO_FILE ? 0 : c[f]))),
    maxSize: Float32Array.from(fileOf, (f) => (f === NO_FILE ? 0 : Math.max(1, maxChecks[f]))),
    pathIndex: new Map(nodes.map((n, i) => [n.data.path, i])),
  };
}
