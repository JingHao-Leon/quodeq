import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hierarchy } from 'd3-hierarchy';
import { buildPackPaint } from './packPaint.js';
import { PACK_COLOR_MODE } from '../../mapVocab.js';
import { DEFAULT_SEVERITY_WEIGHTS } from './mapBadness.js';
import { mixRgb, rgbCss, activityFolderStrength, ACTIVITY_PARENT_HEAT_CAP } from './mapPaint.js';

const close = (a, b) => Math.abs(a - b) < 1e-6;
const C = (r, g, b) => ({ r, g, b });
const PALETTE = {
  bg: C(10, 10, 10), surfaceAlt: C(20, 20, 20), text: C(230, 230, 230), border: C(60, 60, 60),
  worse: C(240, 80, 120), better: C(0, 212, 255), neutral: C(138, 143, 168),
  activity: C(0, 212, 255), activityIdle: C(138, 155, 176), glassParent: C(200, 195, 216),
  sevCritical: C(255, 0, 0), sevMajor: C(255, 140, 0), sevMinor: C(230, 200, 0),
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

const EVERY_FILE = ['src/bad/a.py', 'src/bad/b.py', 'src/good/c.py', 'src/good/d.py'];
const OFTEN = 8;

test('activity: a folder of files edited once is weaker than one whose files hit the scale', () => {
  const edits = new Map([['src/bad/a.py', 1], ['src/bad/b.py', 1], ['src/good/c.py', OFTEN], ['src/good/d.py', OFTEN]]);
  const { at } = paint(PACK_COLOR_MODE.ACTIVITY, true, edits);
  assert.ok(at('src/bad').alpha < at('src/good').alpha);
});

test('activity: a folder with sub-folders never passes the parent heat cap', () => {
  const { at } = paint(PACK_COLOR_MODE.ACTIVITY, false, new Map(EVERY_FILE.map((p) => [p, OFTEN])));
  const capped = mixRgb(PALETTE.surfaceAlt, PALETTE.activity, activityFolderStrength(ACTIVITY_PARENT_HEAT_CAP, false));
  assert.equal(at('src').fill, rgbCss(capped));
});

test('a folder holding one file is drawn as an outline only', () => {
  const top = folder('', [folder('lib', [file('lib/x.py', 1, 1)]), folder('src', [file('src/a.py', 1, 1), file('src/b.py', 1, 1)])]);
  const root = hierarchy(top, (d) => d.children).sum((d) => (d.children ? 0 : 1));
  const circles = root.descendants();
  const out = buildPackPaint({ root, circles, mode: PACK_COLOR_MODE.CONCENTRATION, palette: { ...PALETTE, dark: true }, weights: DEFAULT_SEVERITY_WEIGHTS, editsByPath: new Map() });
  const at = (path) => out[circles.findIndex((c) => c.data.path === path)];
  assert.equal(at('lib').outlineOnly, true);
  assert.equal(at('src').outlineOnly, false);
});

test('the root is painted as the page with a border outline', () => {
  const { out } = paint(PACK_COLOR_MODE.CONCENTRATION, false);
  assert.equal(out[0].fill, 'rgb(20, 20, 20)');
  assert.equal(out[0].stroke, 'rgb(60, 60, 60)');
  assert.equal(out[0].cutOut, true);
});

test('activity joins a Windows tree path to its forward-slash history key', () => {
  const top = folder('', [folder('src', [file('src\\a.py', 1, 1), file('src\\b.py', 1, 1)])]);
  const root = hierarchy(top, (d) => d.children).sum((d) => (d.children ? 0 : 1));
  const circles = root.descendants();
  const out = buildPackPaint({ root, circles, mode: PACK_COLOR_MODE.ACTIVITY, palette: { ...PALETTE, dark: true }, weights: DEFAULT_SEVERITY_WEIGHTS, editsByPath: new Map([['src/a.py', 3]]) });
  assert.equal(out[circles.findIndex((c) => c.data.path === 'src\\a.py')].edits, 3);
});

test('the project circle is surface-alt in both themes: in dark mode one step above its frame, never the page colour', () => {
  const root = (dark) => paint(PACK_COLOR_MODE.CONCENTRATION, dark).out[0].fill;
  assert.equal(root(true), rgbCss(PALETTE.surfaceAlt));
  assert.equal(root(false), rgbCss(PALETTE.surfaceAlt));
  assert.notEqual(root(true), rgbCss(PALETTE.bg));
});

test('files carry the colour of their worst finding, in both themes', () => {
  for (const dark of [true, false]) {
    const { at } = paint(PACK_COLOR_MODE.CONCENTRATION, dark);
    assert.deepEqual(at('src/bad/a.py').hue, PALETTE.sevCritical);
    assert.deepEqual(at('src/good/d.py').hue, PALETTE.sevMinor);
    assert.deepEqual(at('src/good/c.py').hue, PALETTE.neutral);
    assert.notEqual(at('src/good/d.py').fill, at('src/good/c.py').fill);
  }
});
