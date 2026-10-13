import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packStateText } from './packStateText.js';
import { PACK_COLOR_MODE } from '../../mapVocab.js';

const CONC = PACK_COLOR_MODE.CONCENTRATION;

test('concentration reads worse, better or about average by badness', () => {
  assert.equal(packStateText({ badness: 0.5, edits: 0 }, CONC), 'more issues than average');
  assert.equal(packStateText({ badness: -0.5, edits: 0 }, CONC), 'fewer issues than average');
  assert.equal(packStateText({ badness: 0.05, edits: 0 }, CONC), 'about average');
});

test('activity reads how often the circle changed', () => {
  assert.equal(packStateText({ badness: 0, edits: 3 }, PACK_COLOR_MODE.ACTIVITY), 'changed 3 times');
  assert.equal(packStateText({ badness: 0, edits: 1 }, PACK_COLOR_MODE.ACTIVITY), 'changed once');
});

test('an unknown mode reads as concentration', () => {
  assert.equal(packStateText({ badness: 0.5, edits: 2 }, 'health'), 'more issues than average');
});
