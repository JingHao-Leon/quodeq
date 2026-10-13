import test from 'node:test';
import assert from 'node:assert/strict';
import { riskAreaInfo } from './riskAreaInfo.js';
import { t } from '../../../../strings/index.js';
import { AREA_KIND } from '../../mapVocab.js';

const area = (kind, density) => ({
  name: 'article', kind, density, touchedShare: 0.2, layers: ['feature'],
  stats: { files: 3, violations: 2, critical: 0, major: 1 },
});
const densityLine = (info) => info.lines.find((l) => l.label === t('map.riskDensity'));

test('an area shows its weighted issues per file, the measure that places it', () => {
  assert.equal(densityLine(riskAreaInfo(area(AREA_KIND.WATCH, 1.23456))).value, '1.23');
});

test('the measure is absolute, so a small or clean area shows it too', () => {
  assert.equal(densityLine(riskAreaInfo(area(AREA_KIND.SMALL, 0))).value, '0.00');
});
