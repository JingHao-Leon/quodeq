import { hierarchy } from 'd3-hierarchy';
import { buildPackPaint } from './packPaint.js';
import { XYR_STRIDE } from './packLayout.js';
import { GHOST_STROKE_ALPHA } from './packLayers.js';
import { CROSSFADE_CHURN, fileChurn } from './timelapseLayout.js';
import { rgbCss } from './mapPaint.js';
import { filePathKey } from '../../model/mapActivity.js';
import { ROW } from '../../model/historyRows.js';

/** How the view goes from one run to the next. */
export const TRANSITION = Object.freeze({ NONE: 'none', MOVE: 'move', FADE: 'fade' });
/** Why a circle is dotted in the run shown: it left earlier, or it only exists later. */
export const ABSENCE = Object.freeze({ GONE_SINCE: 'goneSince', FIRST_APPEARS: 'firstAppears' });
/** Runs whose node data or paint are kept per view. */
export const RUN_SCENE_CACHE_SIZE = 12;
const Y = 1;
const R = 2;
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
 * The paint of a move from one run to the next (Decision 6): the target
 * run's, except a circle that leaves (painted in `from`, dotted in `to`)
 * keeps its `from` paint while it shrinks back to its slot; it is drawn
 * dotted once the move settles on the target run's own paint.
 * @param {object[]} fromPaint runPaint of the run the move starts from
 * @param {object[]} toPaint runPaint of the target run
 * @returns {object[]} one CirclePaint per history node
 */
export function movePaint(fromPaint, toPaint) {
  return toPaint.map((p, i) => (p?.ghost && fromPaint[i] && !fromPaint[i].ghost ? fromPaint[i] : p));
}

/**
 * Why something is absent from run `k`: gone since the run after the last
 * one it was in, or first appearing in a later run; null when it is present
 * in `k` or in no run at all. Shared by the Pack and Risk time-lapses.
 * @param {{day: string}[]} runs decodeTimelapse(...).runs
 * @param {number} k run index
 * @param {function(number): boolean} isPresentAt whether it is in run j
 * @returns {{kind: string, day: string}|null} kind is an ABSENCE value
 */
export function absenceIn(runs, k, isPresentAt) {
  if (isPresentAt(k)) return null;
  for (let j = k - 1; j >= 0; j--) if (isPresentAt(j)) return { kind: ABSENCE.GONE_SINCE, day: runs[j + 1].day };
  for (let j = k + 1; j < runs.length; j++) if (isPresentAt(j)) return { kind: ABSENCE.FIRST_APPEARS, day: runs[j].day };
  return null;
}

/**
 * Why history node `i` is dotted in run `k` (see absenceIn); a folder is
 * present when any of its files is.
 * @param {{day: string}[]} runs decodeTimelapse(...).runs
 */
export function absenceNote(model, runs, k, i) {
  const leaves = model.nodes[i].leaves().map((n) => model.index.get(n));
  return absenceIn(runs, k, (j) => leaves.some((leaf) => model.sizes[j][leaf] > 0));
}

/** `from` to `to` at `t` (0..1), written into `out`; every node has a slot in both, so nothing pops. */
export function lerpXyr(from, to, t, out) {
  for (let i = 0; i < to.length; i++) out[i] = from[i] + (to[i] - from[i]) * t;
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

/** How to go from run `from` to run `to`: cross-fade big changes and seeks, move small steps. */
export function transitionKind(model, from, to) {
  if (from === to) return TRANSITION.NONE;
  if (Math.abs(to - from) > 1 || fileChurn(model, from, to) > CROSSFADE_CHURN) return TRANSITION.FADE;
  return TRANSITION.MOVE;
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
