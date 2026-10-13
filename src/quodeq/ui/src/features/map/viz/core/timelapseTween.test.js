import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packCss, cssOf, lerpPacked, createPaintTween, paintTweenAt } from './timelapseTween.js';

const HALF = 0.5;
const solid = (fill, alpha = 1, stroke = 'rgb(0, 0, 0)', strokeAlpha = HALF) => ({ ghost: false, file: false, fill, alpha, stroke, strokeAlpha, cutOut: true });
const ghost = { ghost: true, file: true, stroke: 'rgb(9, 9, 9)', strokeAlpha: HALF };

test('a CSS rgb() colour packs to one number and back', () => {
  assert.equal(packCss('rgb(255, 128, 0)'), 0xff8000);
  assert.equal(cssOf(0xff8000), 'rgb(255, 128, 0)');
  assert.equal(cssOf(0xff8000), cssOf(0xff8000));
});

test('packed colours blend per channel', () => {
  assert.equal(lerpPacked(0x000000, 0xc864fe, HALF), 0x64327f);
  assert.equal(lerpPacked(0x102030, 0x405060, 0), 0x102030);
  assert.equal(lerpPacked(0x102030, 0x405060, 1), 0x405060);
});

test('a circle in both runs blends fill, stroke and their opacities over the move', () => {
  const tween = createPaintTween([solid('rgb(0, 0, 0)', 0, 'rgb(0, 0, 0)', 0)], [solid('rgb(200, 100, 254)', 1, 'rgb(100, 0, 0)', 1)]);
  const mid = paintTweenAt(tween, HALF)[0];
  assert.deepEqual([mid.fill, mid.alpha, mid.stroke, mid.strokeAlpha, mid.cutOut, mid.ghost], ['rgb(100, 50, 127)', HALF, 'rgb(50, 0, 0)', HALF, true, false]);
  assert.equal(paintTweenAt(tween, 1)[0].fill, 'rgb(200, 100, 254)');
  assert.equal(paintTweenAt(tween, 0)[0].fill, 'rgb(0, 0, 0)');
});

test('a circle that arrives fades in with its target colour; one that leaves keeps its old paint', () => {
  const from = [ghost, solid('rgb(10, 20, 30)')];
  const to = [solid('rgb(200, 100, 50)', 1, 'rgb(0, 0, 0)', 1), ghost];
  const at = paintTweenAt(createPaintTween(from, to), HALF);
  assert.deepEqual([at[0].ghost, at[0].fill, at[0].alpha, at[0].strokeAlpha], [false, 'rgb(200, 100, 50)', HALF, HALF]);
  assert.equal(at[1], from[1]);
});

test('a circle that stays dotted or keeps its paint is the target paint itself', () => {
  const same = solid('rgb(1, 2, 3)');
  const at = paintTweenAt(createPaintTween([ghost, { ...same }], [ghost, same]), HALF);
  assert.equal(at[0], ghost);
  assert.equal(at[1], same);
});

test('every frame of a move writes into the same paint objects', () => {
  const tween = createPaintTween([solid('rgb(0, 0, 0)')], [solid('rgb(90, 90, 90)')]);
  const first = paintTweenAt(tween, 0);
  const firstPaint = first[0];
  const later = paintTweenAt(tween, HALF);
  assert.equal(later, first);
  assert.equal(later[0], firstPaint);
});
