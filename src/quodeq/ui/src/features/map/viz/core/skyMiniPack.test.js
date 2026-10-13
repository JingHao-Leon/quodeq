import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packAreaFiles } from './skyMiniPack.js';

const EPS = 1e-6;

test('files fill the unit circle without overlapping, bigger checks bigger dots', () => {
  const dots = packAreaFiles([{ checks: 16 }, { checks: 4 }, { checks: 1 }, { checks: 9 }]);
  assert.ok(dots.every((d) => Math.hypot(d.x, d.y) + d.r <= 1 + EPS));
  assert.ok(dots[0].r > dots[1].r);
  for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
    assert.ok(Math.hypot(dots[i].x - dots[j].x, dots[i].y - dots[j].y) >= dots[i].r + dots[j].r - EPS);
  }
});

test('one file sits in the middle; none is nothing', () => {
  const [only] = packAreaFiles([{ checks: 3 }]);
  assert.ok(Math.abs(only.x) < EPS && Math.abs(only.y) < EPS);
  assert.deepEqual(packAreaFiles([]), []);
});
