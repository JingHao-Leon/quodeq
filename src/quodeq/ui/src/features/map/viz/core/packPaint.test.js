import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hierarchy } from 'd3-hierarchy';
import { buildPackPaint } from './packPaint.js';
import { PACK_COLOR_MODE } from '../../mapVocab.js';
import { DEFAULT_SEVERITY_WEIGHTS } from './mapBadness.js';

const close = (a, b) => Math.abs(a - b) < 1e-6;
const C = (r, g, b) => ({ r, g, b });
const PALETTE = {
  bg: C(10, 10, 10), surfaceAlt: C(20, 20, 20), text: C(230, 230, 230), border: C(60, 60, 60),
  worse: C(240, 80, 120), better: C(0, 212, 255), neutral: C(138, 143, 168),
  activity: C(0, 212, 255), activityIdle: C(138, 155, 176), glassParent: C(200, 195, 216),
};
const file = (path, violations, compliance, critical = 0) => ({
  name: path.split('/').pop(), path, isFile: true, violations, compliance, severity: { critical, major: 0, minor: violations - critical },
});
const folder = (path, children) => ({
  name: path.split('/').pop(), path, isFile: false, children,
  violations: children.reduce((s, c) => s + c.violations, 0),
  compliance: children.reduce((s, c) => s + c.compliance, 0),
  severity: ['critical', 'major', 'minor'].reduce((o, k) => ({ ...o, [k]: children.reduce((s, c) => s + c.severity[k], 0) }), {}),
});

function tree() {
  const bad = folder('src/bad', [file('src/bad/a.py', 6, 1, 2), file('src/bad/b.py', 5, 0, 1)]);
  const good = folder('src/good', [file('src/good/c.py', 0, 9), file('src/good/d.py', 1, 12)]);
  return folder('', [folder('src', [bad, good])]);
}

function paint(mode, dark, editsByPath = new Map()) {
  const root = hierarchy(tree(), (d) => d.children).sum((d) => (d.children ? 0 : 1));
  const circles = root.descendants();
  const out = buildPackPaint({ root, circles, mode, palette: { ...PALETTE, dark }, weights: DEFAULT_SEVERITY_WEIGHTS, editsByPath });
  return { circles, out, at: (path) => out[circles.findIndex((c) => c.data.path === path)] };
}

test('aligned with the circles', () => {
  const { circles, out } = paint(PACK_COLOR_MODE.CONCENTRATION, true);
  assert.equal(out.length, circles.length);
});

test('the bad folder is worse, the good folder better', () => {
  const { at } = paint(PACK_COLOR_MODE.CONCENTRATION, true);
  assert.ok(at('src/bad').badness > 0.5);
  assert.ok(at('src/good').badness < -0.3);
});

test('dark glass: folders holding files carry the hue, parents a faint veil, no cut-outs', () => {
  const { at } = paint(PACK_COLOR_MODE.CONCENTRATION, true);
  assert.equal(at('src/bad').fill, 'rgb(240, 80, 120)');
  assert.equal(at('src').fill, 'rgb(200, 195, 216)');
  assert.equal(at('src').cutOut, false);
});

test('light: solid colours precomputed against the page, cut out under sub-folders', () => {
  const { at } = paint(PACK_COLOR_MODE.CONCENTRATION, false);
  assert.equal(at('src/bad').alpha, 1);
  assert.equal(at('src/bad').cutOut, true);
  assert.notEqual(at('src/bad').fill, 'rgb(240, 80, 120)');
});

test('activity: changed files carry the activity hue, unchanged ones stay plain', () => {
  const { at } = paint(PACK_COLOR_MODE.ACTIVITY, true, new Map([['src/bad/a.py', 4]]));
  assert.equal(at('src/bad/a.py').edits, 4);
  assert.notEqual(at('src/bad/a.py').fill, at('src/bad/b.py').fill);
  assert.equal(at('src/bad/b.py').fill, 'rgb(20, 20, 20)');
});

test('the project average follows the tree it is given (a filtered tree recolours)', () => {
  // 'hot' has twice the full tree's weight per file; alone, it IS the average.
  const majorFile = (path) => ({
    name: path.split('/').pop(), path, isFile: true, violations: 2, compliance: 4,
    severity: { critical: 0, major: 2, minor: 0 },
  });
  const hot = folder('src/hot', [majorFile('src/hot/a.py'), majorFile('src/hot/b.py')]);
  const cold = folder('src/cold', [file('src/cold/c.py', 0, 10), file('src/cold/d.py', 0, 10)]);
  const hotBadness = (top) => {
    const root = hierarchy(top, (d) => d.children).sum((d) => (d.children ? 0 : 1));
    const circles = root.descendants();
    const out = buildPackPaint({ root, circles, mode: PACK_COLOR_MODE.CONCENTRATION, palette: { ...PALETTE, dark: true }, weights: DEFAULT_SEVERITY_WEIGHTS, editsByPath: new Map() });
    return out[circles.findIndex((c) => c.data.path === 'src/hot')].badness;
  };
  const full = hotBadness(folder('', [folder('src', [hot, cold])]));
  const alone = hotBadness(folder('', [folder('src', [hot])]));
  assert.ok(close(full, 0.625));
  assert.ok(close(alone, 0));
});
