import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pyRound1, principleScore, dimensionScore, overallScore } from './livePreview.js';

const FIXTURE = JSON.parse(readFileSync(new URL('./parity.fixture.json', import.meta.url), 'utf8'));

test('pyRound1 rounds like Python round(x, 1), exact halves to the even tenth', () => {
  for (const [x, expected] of FIXTURE.rounding) assert.equal(pyRound1(x), expected, `round(${x}, 1)`);
});

test('every principle score matches the Python scorer', () => {
  for (const { params, projects, expected } of FIXTURE.cases) {
    for (const project of projects) {
      for (const dim of project.dimensions) {
        for (const p of dim.principles) {
          assert.equal(principleScore(p, params), expected[project.id].principles[`${dim.dimension}/${p.id}`]);
        }
      }
    }
  }
});

test('every dimension and project score matches the Python scorer', () => {
  for (const { params, projects, expected } of FIXTURE.cases) {
    for (const project of projects) {
      const dims = project.dimensions.map((d) => ({ dimension: d.dimension, score: dimensionScore(d, params) }));
      for (const d of dims) assert.equal(d.score, expected[project.id].dimensions[d.dimension]);
      assert.equal(overallScore(dims, params), expected[project.id].overall, project.id);
    }
  }
});
