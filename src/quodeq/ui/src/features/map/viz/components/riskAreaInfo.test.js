import test from 'node:test';
import assert from 'node:assert/strict';
import { riskAreaInfo, riskLabelText, riskTooltipLines } from './riskAreaInfo.js';
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

test('the measure is absolute, so a clean area shows it too', () => {
  assert.equal(densityLine(riskAreaInfo(area(AREA_KIND.HEALTHY, 0))).value, '0.00');
});

test('an area too small to judge shows no weighted issues per file', () => {
  const info = riskAreaInfo(area(AREA_KIND.SMALL, 1.5));
  assert.equal(densityLine(info), undefined);
  assert.equal(info.lines[0].value, t('map.riskKindSmall'));
});

const lineOf = (info, key) => info.lines.find((l) => l.label === t(key));

test('the first line is the sky zone the density puts the area in', () => {
  const zoneOfArea = (density) => riskAreaInfo(area(AREA_KIND.WATCH, density)).lines[0];
  assert.deepEqual(zoneOfArea(1.2), { label: t('map.riskZone'), value: t('map.riskZoneNameFixFirst') });
  assert.equal(zoneOfArea(0.6).value, t('map.riskZoneNameWatch'));
  assert.equal(zoneOfArea(0.1).value, t('map.riskZoneNameHealthy'));
});

test('the kind shows only for a hotspot or dormant debt, the kinds the sky rings', () => {
  assert.equal(lineOf(riskAreaInfo(area(AREA_KIND.HOTSPOT, 1.2)), 'map.riskKind').value, t('map.riskKindHotspot'));
  assert.equal(lineOf(riskAreaInfo(area(AREA_KIND.DORMANT, 1.2)), 'map.riskKind').value, t('map.riskKindDormant'));
  assert.equal(lineOf(riskAreaInfo(area(AREA_KIND.WATCH, 0.6)), 'map.riskKind'), undefined);
  assert.equal(lineOf(riskAreaInfo(area(AREA_KIND.HEALTHY, 0.1)), 'map.riskKind'), undefined);
});

test('a label is the area name only', () => {
  assert.deepEqual(riskLabelText({ ...area(AREA_KIND.HOTSPOT, 2.37), name: 'Article' }), { title: 'Article' });
});

test('the hover card leads with weighted issues per file, then the kind and the issues, without the zone', () => {
  const lines = riskTooltipLines(area(AREA_KIND.HOTSPOT, 2.37));
  assert.deepEqual(lines.map((l) => l.label), [t('map.riskDensity'), t('map.riskKind'), t('map.riskIssues')]);
  assert.equal(lines[0].value, '2.37');
  assert.deepEqual(riskTooltipLines(area(AREA_KIND.WATCH, 0.6)).map((l) => l.label), [t('map.riskDensity'), t('map.riskIssues')]);
});
