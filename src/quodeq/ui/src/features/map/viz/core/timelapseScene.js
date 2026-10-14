import { hierarchy } from 'd3-hierarchy';
import { buildPackPaint } from './packPaint.js';
import { XYR_STRIDE, XYR_Y as Y, XYR_R as R } from './packLayout.js';
import { GHOST_STROKE_ALPHA } from './packLayers.js';
import { focusTransformFor } from './packCanvasGeometry.js';
import { rgbCss } from './mapPaint.js';
import { filePathKey } from '../../model/mapActivity.js';
import { ROW } from '../../model/historyRows.js';

/** How the view goes from one run to the next. */
export const TRANSITION = Object.freeze({ NONE: 'none', MOVE: 'move' });
/** Runs whose node data or paint are kept per view. */
export const RUN_SCENE_CACHE_SIZE = 12;
const PATH_SEP = '/';
const NO_SEVERITY = Object.freeze({ critical: 0, major: 0, minor: 0 });

function fileData(node, row, hid) {
  const base = { hid, name: node.data.name, path: node.data.path, isFile: true };
  if (!row) return { ...base, absent: true, violations: 0, compliance: 0, severity: NO_SEVERITY, edits: 0 };
  const violations = row[ROW.VIOLATIONS];
  const critical = row[ROW.CRITICAL];
  const major = row[ROW.MAJOR];
  return {
    ...base, absent: false, violations, compliance: row[ROW.COMPLIANCE], edits: row[ROW.EDITS],
    severity: { critical, major, minor: Math.max(0, violations - critical - major) },
  };
}

function folderData(node, kids, hid) {
  const sum = (pick) => kids.reduce((s, c) => s + pick(c), 0);
  return {
    hid, name: node.data.name, path: node.data.path, isFile: false, children: kids, absent: kids.every((c) => c.absent),
    violations: sum((c) => c.violations), compliance: sum((c) => c.compliance), edits: sum((c) => c.edits),
    severity: { critical: sum((c) => c.severity.critical), major: sum((c) => c.severity.major), minor: sum((c) => c.severity.minor) },
  };
}

/**
 * Run k's numbers per history node, shaped like the Map's tree nodes (so the
 * pack paint and tooltip read them as they are). A file absent from the run
 * is kept with zeros and `absent: true`; a folder is absent when all its
 * files are. `hid` is the node's index in the history model.
 * @param {object} model buildTimelapseModel(...)
 * @param {{rowsAt: function(number): Map<number, number[]>}} data decodeTimelapse(...)
 * @param {number} k run index
 * @returns {object[]} one node per history node, in model order
 */
export function runNodeData(model, data, k) {
  const rows = data.rowsAt(k);
  const out = new Array(model.nodes.length);
  for (let i = model.nodes.length - 1; i >= 0; i--) {
    const node = model.nodes[i];
    if (node.children) out[i] = folderData(node, node.children.map((c) => out[model.index.get(c)]), i);
    else out[i] = fileData(node, rows.get(model.fileOf[i]), i);
  }
  return out;
}

/** The present part of a run's tree, for the pack paint (absent nodes are left out). */
const presentChildren = (d) => (d.children ? d.children.filter((c) => !c.absent) : null);

/**
 * The pack paint of run k, indexed by history node: present nodes as the
 * normal pack paints them (over the run's own tree, so the project average
 * is the run's), absent nodes as dotted ghosts in the text colour.
 * @param {{model: object, nodeData: object[], mode: string, palette: object, weights: object}} input
 * @returns {object[]} one CirclePaint per history node
 */
export function runPaint({ model, nodeData, mode, palette, weights }) {
  const stroke = rgbCss(palette.text);
  const out = model.nodes.map((_, i) => ({ ghost: true, file: nodeData[i].isFile, stroke, strokeAlpha: GHOST_STROKE_ALPHA }));
  if (nodeData[0].absent) return out;
  const root = hierarchy(nodeData[0], presentChildren);
  const circles = root.descendants();
  const editsByPath = new Map(root.leaves().map((leaf) => [filePathKey(leaf.data.path), leaf.data.edits]));
  buildPackPaint({ root, circles, mode, palette, weights, editsByPath }).forEach((p, j) => { out[circles[j].data.hid] = p; });
  return out;
}

/**
 * How a circle that arrives or leaves scales its offset: by its parent's
 * size now over the parent's size on the side the circle exists, so it
 * grows or shrinks where it lands inside the parent even while the parent
 * grows or shrinks around it.
 */
function offsetScale({ fromIn, toIn }, parentR) {
  if (fromIn === toIn) return 1;
  const full = fromIn ? parentR.from : parentR.to;
  return full > 0 ? parentR.now / full : 1;
}

/**
 * `from` to `to` at `t` (0..1), written into `out`. Each circle moves
 * relative to its parent (parents come first in node order), so a newcomer
 * starts inside its moving parent; a circle absent on one side (radius 0)
 * keeps the other side's offset, so it grows in or shrinks out in place.
 * The offset of a circle that arrives or leaves scales with its parent's
 * radius, so it pops in or out inside the parent while the parent grows or
 * shrinks (a new folder and its content pop in as one piece), instead of
 * sitting outside the parent until the parent reaches its size.
 * @param {Int32Array} parent the model's parent per node
 */
export function lerpXyr(parent, from, to, t, out) {
  out[0] = from[0] + (to[0] - from[0]) * t;
  out[Y] = from[Y] + (to[Y] - from[Y]) * t;
  out[R] = from[R] + (to[R] - from[R]) * t;
  for (let i = 1; i < parent.length; i++) {
    const o = i * XYR_STRIDE;
    const p = parent[i] * XYR_STRIDE;
    const fromIn = from[o + R] > 0;
    const toIn = to[o + R] > 0;
    const fx = from[o] - from[p];
    const fy = from[o + Y] - from[p + Y];
    const tx = to[o] - to[p];
    const ty = to[o + Y] - to[p + Y];
    const sx = fromIn ? fx : tx;
    const sy = fromIn ? fy : ty;
    const k = offsetScale({ fromIn, toIn }, { from: from[p + R], to: to[p + R], now: out[p + R] });
    out[o] = out[p] + (sx + ((toIn ? tx : fx) - sx) * t) * k;
    out[o + Y] = out[p + Y] + (sy + ((toIn ? ty : fy) - sy) * t) * k;
    out[o + R] = from[o + R] + (to[o + R] - from[o + R]) * t;
  }
  return out;
}

/** Layout circles after the focus transform, written into `out` (one object per node, reused). */
export function screenCoordsInto(xyr, { k, tx, ty }, out) {
  const n = xyr.length / XYR_STRIDE;
  for (let i = 0; i < n; i++) {
    const o = i * XYR_STRIDE;
    const sc = out[i] || (out[i] = { cx: 0, cy: 0, r: 0 });
    sc.cx = xyr[o] * k + tx;
    sc.cy = xyr[o + Y] * k + ty;
    sc.r = xyr[o + R] * k;
  }
  out.length = n;
  return out;
}

/**
 * The camera on node `i` of a run: its circle in `xyr` (the run on screen)
 * at that run's size, or its nearest ancestor the run draws when the run
 * does not hold it.
 * @param {Int32Array} parent the model's parent per node
 */
export function runFocusTransform(parent, xyr, i) {
  let j = i;
  while (j > 0 && !(xyr[j * XYR_STRIDE + R] > 0)) j = parent[j];
  const o = j * XYR_STRIDE;
  return focusTransformFor({ x: xyr[o], y: xyr[o + Y], r: xyr[o + R] });
}

/** Every move between runs moves (and grows or shrinks) the circles, never cross-fades. */
export function transitionKind(from, to) {
  return from === to ? TRANSITION.NONE : TRANSITION.MOVE;
}

function presence(model, k, isFolder) {
  const size = model.sizes[k];
  const n = model.parent.length;
  const present = new Uint8Array(n);
  const count = new Int32Array(n);
  const onlyChild = new Int32Array(n).fill(-1);
  for (let i = n - 1; i > 0; i--) {
    if (!isFolder[i]) present[i] = size[i] > 0 ? 1 : 0;
    if (!present[i]) continue;
    const p = model.parent[i];
    present[p] = 1;
    count[p]++;
    onlyChild[p] = i;
  }
  return { present, count, onlyChild };
}

/**
 * Per node, the folder it is drawn as in run `k`: itself, or, for a folder
 * holding only one folder that run, the end of that chain (the Map's
 * collapsed chains, decided per run, as the layout draws them). -1 for nodes
 * the run does not hold.
 * @returns {Int32Array}
 */
export function chainEndsIn(model, k) {
  const n = model.parent.length;
  const isFolder = new Uint8Array(n);
  for (let i = 1; i < n; i++) isFolder[model.parent[i]] = 1;
  const { present, count, onlyChild } = presence(model, k, isFolder);
  present[0] = 1;
  const end = new Int32Array(n).fill(-1);
  for (let i = n - 1; i >= 0; i--) {
    if (!present[i]) continue;
    const only = onlyChild[i];
    end[i] = i > 0 && count[i] === 1 && isFolder[only] ? end[only] : i;
  }
  return end;
}

function folderAt(model, path) {
  const i = model.pathIndex.get(path);
  return i !== undefined && model.nodes[i].children ? i : null;
}

/** The history folder that collapses a chain through `path` (dashboard `a/b`,
 * history `a/b/c`): it lies under `path` and its parent lies above it. */
function collapsedChainAt(model, path) {
  const under = path + PATH_SEP;
  for (let i = 1; i < model.nodes.length; i++) {
    const node = model.nodes[i];
    if (!node.children || !node.data.path.startsWith(under)) continue;
    const above = node.parent.data.path;
    if (!above || under.startsWith(above + PATH_SEP)) return i;
  }
  return null;
}

const parentPathOf = (p) => (p.includes(PATH_SEP) ? p.slice(0, p.lastIndexOf(PATH_SEP)) : '');

/**
 * The history folder to frame for a Map path: the path itself, the collapsed
 * chain that holds it, or its nearest ancestor folder (0 = root). Never a
 * file and never missing, so the camera always has a circle to frame.
 * @returns {number} history node index
 */
export function focusIndexFor(model, path) {
  let p = path || '';
  if (!p) return 0;
  const own = folderAt(model, p) ?? collapsedChainAt(model, p);
  if (own !== null) return own;
  while (p) {
    p = parentPathOf(p);
    const i = folderAt(model, p);
    if (i !== null) return i;
  }
  return 0;
}

/** `compute(k)` remembered for the last `size` runs asked for. */
export function cachedRuns(compute, size = RUN_SCENE_CACHE_SIZE) {
  const memo = new Map();
  return (k) => {
    const value = memo.has(k) ? memo.get(k) : compute(k);
    memo.delete(k);
    memo.set(k, value);
    if (memo.size > size) memo.delete(memo.keys().next().value);
    return value;
  };
}
