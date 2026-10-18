import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { recallShape, rememberShape, DEFAULT_SHAPE, resetShapes } from './overviewShape.js';

beforeEach(() => resetShapes());

test('a project never seen gets the default skeleton shape', () => {
  assert.deepEqual(recallShape('p'), DEFAULT_SHAPE);
  assert.deepEqual(recallShape(null), DEFAULT_SHAPE);
});

test('the last shape seen is what the next skeleton draws, per project', () => {
  rememberShape('p', { cards: 6, height: 408.6 });
  rememberShape('q', { cards: 3 });
  rememberShape('p', { bottom: 663.2 });
  assert.deepEqual(recallShape('p'), { cards: 6, height: 409, bottom: 663 });
  assert.deepEqual(recallShape('q'), { cards: 3, height: null, bottom: null });
});

test('a nonsense shape is ignored', () => {
  rememberShape('p', { cards: -1 });
  assert.deepEqual(recallShape('p'), DEFAULT_SHAPE);
});
