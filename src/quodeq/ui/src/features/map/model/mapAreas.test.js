import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAreas, worstSeverity, NO_AREAS } from './mapAreas.js';
import { SEVERITY } from '../../../vocab/severity.js';

const PAYLOAD = {
  fileNames: ['a/x.kt', 'a/y.kt', 'b/z.py', 'gone.py'],
  fileArea: ['article', 'article', 'api', 'api'],
  fileLayer: ['feature', 'domain-data', '', ''],
  frames: [{
    files: [[0, 4, 1, 3, 1, 0, 0, 0, 0], [1, 0.25, 1, 9, 0, 0, 0, 0, 0], [2, 0, 0, 5, 0, 0, 0, 0, 0]],
    areas: [
      { area: 'article', files: 2, needPct: 0.9, kind: 'hotspot', touchedShare: 0.5 },
      { area: 'api', files: 1, needPct: 0.1, kind: 'small', touchedShare: 0 },
    ],
  }],
};

test('the worst violation of a row', () => {
  assert.equal(worstSeverity([0, 0, 2, 0, 1, 1]), SEVERITY.CRITICAL);
  assert.equal(worstSeverity([0, 0, 2, 0, 0, 1]), SEVERITY.MAJOR);
  assert.equal(worstSeverity([0, 0, 2, 0, 0, 0]), SEVERITY.MINOR);
  assert.equal(worstSeverity([0, 0, 0, 4, 0, 0]), null);
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
