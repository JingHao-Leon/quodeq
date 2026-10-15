import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markRowStarts, ROW_START_ATTR } from './useRowStarts.js';

const item = (offsetLeft) => {
  const attrs = new Set();
  return { offsetLeft, attrs, toggleAttribute: (name, on) => (on ? attrs.add(name) : attrs.delete(name)) };
};
const starts = (children) => children.map((c) => c.attrs.has(ROW_START_ATTR));

test('markRowStarts: one row marks only its first item', () => {
  const children = [item(0), item(120), item(260)];
  markRowStarts({ children });
  assert.deepEqual(starts(children), [true, false, false]);
});

test('markRowStarts: an item back left of the one before it starts a row, and unwrapping clears the mark', () => {
  const children = [item(0), item(400), item(0), item(150)];
  markRowStarts({ children });
  assert.deepEqual(starts(children), [true, false, true, false]);
  children[2].offsetLeft = 560;
  children[3].offsetLeft = 700;
  markRowStarts({ children });
  assert.deepEqual(starts(children), [true, false, false, false]);
});
