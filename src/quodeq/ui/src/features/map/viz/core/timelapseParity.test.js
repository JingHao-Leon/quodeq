import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFileTree } from './fileTree.js';
import { buildPackRoot, packInPlace } from './packLayout.js';
import { buildTimelapseModel } from './timelapseModel.js';
import { anchorLayout } from './timelapseLayout.js';
import { layoutModelOf } from './timelapseLayouts.js';

// Small integer check counts, so many siblings tie on size, and findings
// reported in a shuffled order: the inputs that made the views disagree.
function scenario(seed) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const files = Array.from({ length: 40 }, (_, i) => `src/${'abc'[i % 3]}/f${String(i).padStart(2, '0')}.py`);
  const v = files.map(() => Math.floor(rnd() * 3));
  const c = files.map(() => 1 + Math.floor(rnd() * 3));
  const dim = { dimension: 'x', violations: [], compliance: [] };
  for (const i of files.map((_, k) => k).sort(() => rnd() - 0.5)) {
    for (let k = 0; k < v[i]; k++) dim.violations.push({ file: files[i] });
    for (let k = 0; k < c[i]; k++) dim.compliance.push({ file: files[i] });
  }
  return { files, dim, latest: Float32Array.from(files, (_, i) => Math.max(1, v[i] + c[i])) };
}

function maxDistance(staticRoot, model, xyr) {
  const byPath = new Map(staticRoot.descendants().map((n) => [n.data.path, n]));
  let worst = 0;
  model.nodes.forEach((n, i) => {
    const s = byPath.get(n.data.path);
    if (s) worst = Math.max(worst, Math.hypot(s.x - xyr[i * 3], s.y - xyr[i * 3 + 1]));
  });
  return worst;
}

test('the time-lapse places every circle where the static Circle Pack does', () => {
  for (const seed of [7, 11, 23]) {
    const { files, dim, latest } = scenario(seed);
    const model = buildTimelapseModel({ fileNames: files, checks: [latest] });
    const staticRoot = packInPlace(buildPackRoot(buildFileTree([dim])));
    assert.ok(maxDistance(staticRoot, model, anchorLayout(layoutModelOf(model))) < 1e-3, `seed ${seed}`);
  }
});

test('ties in the latest run do not follow the whole-history size', () => {
  const { files, dim, latest } = scenario(5);
  const bigger = Float32Array.from(latest, (x, i) => x + (i % 2) * 9); // an older run where odd files were larger
  const model = buildTimelapseModel({ fileNames: files, checks: [bigger, latest] });
  const staticRoot = packInPlace(buildPackRoot(buildFileTree([dim])));
  assert.ok(maxDistance(staticRoot, model, anchorLayout(layoutModelOf(model))) < 1e-3);
});
