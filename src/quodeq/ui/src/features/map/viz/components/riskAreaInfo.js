import { t } from '../../../../strings/index.js';
import { PERCENT } from '../../../../constants.js';
import { AREA_KIND, RING_KINDS, SKY_ZONE } from '../../mapVocab.js';
import { severityLines } from './levelInfoLines.js';
import { pluralKey } from '../../../../utils/plural.js';
import { zoneOf } from '../core/skyScale.js';

/** Decimals shown for an area's weighted issues per file. */
const DENSITY_DECIMALS = 2;
const KIND_KEY = new Map([
  [AREA_KIND.HOTSPOT, 'map.riskKindHotspot'], [AREA_KIND.DORMANT, 'map.riskKindDormant'],
  [AREA_KIND.WATCH, 'map.riskKindWatch'], [AREA_KIND.HEALTHY, 'map.riskKindHealthy'], [AREA_KIND.SMALL, 'map.riskKindSmall'],
]);

/** The kind's display name. */
export function kindLabel(kind) {
  return t(KIND_KEY.get(kind) || 'map.riskKindSmall');
}

/** The canvas label of an area: its name (its numbers are in the hover card and the panel). */
export function riskLabelText(area) {
  return { title: area.name };
}

/** An area's keyboard-list text: its name and its issue count. */
export function riskItemText(area) {
  const count = area.stats.violations;
  return t(pluralKey(count, 'map.riskAreaAriaOne', 'map.riskAreaAria'), { name: area.name, count });
}

/** Weighted issues per file, left out for an area too small to judge. */
function densityLines(area) {
  if (area.kind === AREA_KIND.SMALL) return [];
  return [{ label: t('map.riskDensity'), value: (area.density || 0).toFixed(DENSITY_DECIMALS) }];
}

const ZONE_KEY = new Map([
  [SKY_ZONE.FIX_FIRST, 'map.riskZoneNameFixFirst'], [SKY_ZONE.WATCH, 'map.riskZoneNameWatch'], [SKY_ZONE.HEALTHY, 'map.riskZoneNameHealthy'],
]);

/**
 * The zone the sky puts the area in (by its density, as the rings), then
 * Hotspot or Dormant debt when the area is one: the backend's other kinds
 * rank the area against the project and would contradict the rings.
 */
function placeLines(area) {
  const zone = area.kind === AREA_KIND.SMALL ? kindLabel(AREA_KIND.SMALL) : t(ZONE_KEY.get(zoneOf(area.density || 0)));
  const lines = [{ label: t('map.riskZone'), value: zone }];
  if (RING_KINDS.includes(area.kind)) lines.push({ label: t('map.riskKind'), value: kindLabel(area.kind) });
  return lines;
}

/** The info panel (and tooltip) content for an area. */
export function riskAreaInfo(area) {
  const s = area.stats;
  const minor = s.violations - s.critical - s.major;
  return {
    title: area.name,
    tag: area.layers.join(', '),
    lines: [
      ...placeLines(area),
      { label: t('map.riskFiles'), value: s.files },
      { label: t('map.riskIssues'), value: s.violations },
      ...severityLines({ critical: s.critical, major: s.major, minor }, { colored: true }),
      ...densityLines(area),
      { label: t('map.riskChanged'), value: t('map.riskChangedValue', { pct: Math.round(area.touchedShare * PERCENT) }) },
    ],
  };
}

/**
 * The hover card's lines above its severity rows: the area's weighted issues per file first,
 * Hotspot or Dormant debt when the area is one, then its issue count. No zone: the rings and the legend give it.
 */
export function riskTooltipLines(area) {
  const lines = [...densityLines(area)];
  if (RING_KINDS.includes(area.kind)) lines.push({ label: t('map.riskKind'), value: kindLabel(area.kind) });
  lines.push({ label: t('map.riskIssues'), value: area.stats.violations });
  return lines;
}
