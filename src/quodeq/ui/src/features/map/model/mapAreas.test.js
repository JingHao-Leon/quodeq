import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAreas, NO_AREAS } from './mapAreas.js';

const PAYLOAD = {
  fileNames: ['a/x.kt', 'a/y.kt', 'b/z.py', 'gone.py'],
  fileArea: ['article', 'article', 'api', 'api'],
  fileLayer: ['feature', 'domain-data', '', ''],
  frames: [{
    files: [[0, 4, 1, 3, 1, 0, 0, 0, 0], [1, 0.25, 1, 9, 0, 0, 0, 0, 0], [2, 0, 0, 5, 0, 0, 0, 0, 0]],
    areas: [
      { area: 'article', files: 2, density: 2.125, kind: 'hotspot', touchedShare: 0.5 },
      { area: 'api', files: 1, kind: 'small', touchedShare: 0 },
    ],
  }],
};

test('each file dot carries its own stats, the inputs of the Circle Pack file colour', () => {
  const article = decodeAreas(PAYLOAD).areas.find((a) => a.name === 'article');
  assert.deepEqual(article.dots[0], {
    path: 'a/x.kt', checks: 4,
    stats: { violations: 1, compliance: 3, weight: 4, files: 1, critical: 1, major: 0 },
  });
});

test('areas carry their findings per file, zero when the payload has none', () => {
  const { areas } = decodeAreas(PAYLOAD);
  assert.equal(areas.find((a) => a.name === 'article').density, 2.125);
  assert.equal(areas.find((a) => a.name === 'api').density, 0);
});

test('areas carry their files, summed stats and shown layers', () => {
  const { areas } = decodeAreas(PAYLOAD);
  const article = areas.find((a) => a.name === 'article');
  assert.equal(article.dots.length, 2);
  assert.deepEqual(article.stats, { violations: 2, compliance: 12, weight: 4.25, files: 2, critical: 1, major: 0 });
  assert.deepEqual(article.layers, ['domain-data', 'feature']);
  assert.equal(article.kind, 'hotspot');
});

test('the average is the weight per present file, and every present file is listed', () => {
  const out = decodeAreas(PAYLOAD);
  assert.equal(out.average, 4.25 / 3);
  assert.deepEqual(out.files.map((f) => f.path), ['a/x.kt', 'a/y.kt', 'b/z.py']);
});

test('an empty or malformed payload is no areas', () => {
  assert.equal(decodeAreas(null), NO_AREAS);
  assert.equal(decodeAreas({ fileNames: [], frames: [] }), NO_AREAS);
});
