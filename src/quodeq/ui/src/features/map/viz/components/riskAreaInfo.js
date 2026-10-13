import { t } from '../../../../strings/index.js';
import { PERCENT } from '../../../../constants.js';
import { AREA_KIND } from '../../mapVocab.js';
import { severityLines } from './levelInfoLines.js';

const KIND_KEY = new Map([
  [AREA_KIND.HOTSPOT, 'map.riskKindHotspot'], [AREA_KIND.DORMANT, 'map.riskKindDormant'],
  [AREA_KIND.WATCH, 'map.riskKindWatch'], [AREA_KIND.HEALTHY, 'map.riskKindHealthy'], [AREA_KIND.SMALL, 'map.riskKindSmall'],
]);

/** The kind's display name. */
export function kindLabel(kind) {
  return t(KIND_KEY.get(kind) || 'map.riskKindSmall');
}

function issuesSub(count) {
  if (!count) return t('map.riskClean');
  return count === 1 ? t('map.riskIssuesSubOne') : t('map.riskIssuesSub', { count });
}

/** The two-line canvas label of an area: its name and its issue count. */
export function riskLabelText(area) {
  return { title: area.name, sub: issuesSub(area.stats.violations) };
}

/** The need comparison, left out for an area too small to judge. */
function needLines(area) {
  if (area.kind === AREA_KIND.SMALL) return [];
  return [{ label: t('map.riskNeed'), value: t('map.riskNeedValue', { pct: Math.round(area.needPct * PERCENT) }) }];
}

/** The info panel (and tooltip) content for an area. */
export function riskAreaInfo(area) {
  const s = area.stats;
  const minor = s.violations - s.critical - s.major;
  return {
    title: area.name,
    tag: area.layers.join(', '),
    lines: [
      { label: t('map.riskKind'), value: kindLabel(area.kind) },
      { label: t('map.riskFiles'), value: s.files },
      { label: t('map.riskIssues'), value: s.violations },
      ...severityLines({ critical: s.critical, major: s.major, minor }, { colored: true }),
      ...needLines(area),
      { label: t('map.riskChanged'), value: t('map.riskChangedValue', { pct: Math.round(area.touchedShare * PERCENT) }) },
    ],
  };
}
