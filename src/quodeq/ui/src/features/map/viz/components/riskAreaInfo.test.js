import test from 'node:test';
import assert from 'node:assert/strict';
import { riskAreaInfo } from './riskAreaInfo.js';
import { t } from '../../../../strings/index.js';
import { AREA_KIND } from '../../mapVocab.js';

const area = (kind) => ({
  name: 'article', kind, needPct: 0.99, touchedShare: 0.2, layers: ['feature'],
  stats: { files: 3, violations: 2, critical: 0, major: 1 },
});
const hasNeedLine = (info) => info.lines.some((l) => l.label === t('map.riskNeed'));

test('a judged area says how its need compares with the other areas', () => {
  assert.ok(hasNeedLine(riskAreaInfo(area(AREA_KIND.WATCH))));
});

test('an area too small to judge leaves out the need comparison', () => {
  assert.ok(!hasNeedLine(riskAreaInfo(area(AREA_KIND.SMALL))));
});
