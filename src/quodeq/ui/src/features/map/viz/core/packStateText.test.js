import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packStateText } from './packStateText.js';
import { badnessHue } from './mapPaint.js';
import { PACK_COLOR_MODE } from '../../mapVocab.js';

const CONC = PACK_COLOR_MODE.CONCENTRATION;

test('concentration reads worse, better or about average by badness', () => {
  assert.equal(packStateText({ badness: 0.5, edits: 0 }, CONC), 'more issues than average');
  assert.equal(packStateText({ badness: -0.5, edits: 0 }, CONC), 'fewer issues than average');
  assert.equal(packStateText({ badness: 0.01, edits: 0 }, CONC), 'about average');
});

test('the spoken state agrees with the painted hue (one about-average band)', () => {
  const palette = { worse: 'worse', better: 'better', neutral: 'neutral' };
  assert.equal(badnessHue(0.05, palette), 'worse');
  assert.equal(packStateText({ badness: 0.05, edits: 0 }, CONC), 'more issues than average');
});

test('activity reads how often the circle changed', () => {
  assert.equal(packStateText({ badness: 0, edits: 3 }, PACK_COLOR_MODE.ACTIVITY), 'changed 3 times');
  assert.equal(packStateText({ badness: 0, edits: 1 }, PACK_COLOR_MODE.ACTIVITY), 'changed once');
});

test('an unknown mode reads as concentration', () => {
  assert.equal(packStateText({ badness: 0.5, edits: 2 }, 'health'), 'more issues than average');
});
